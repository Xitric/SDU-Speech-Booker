import * as functions from 'firebase-functions'
import {dialogflow, Suggestions} from 'actions-on-google'
import * as firestore from './database-connection'



const ActionContexts = {
    root: 'root',
    view: 'view',
    booking: 'booking',
    booking_expects_time: 'booking_expects_time',
    booking_available: 'booking_available',
    booking_unavailable: 'booking_unavailable',
    booking_browsing: 'booking_browsing',
    booking_expects_participant: 'booking_expects_participant'
}

interface Booking {
    room: string
    date: string
    start: string
    end: string
}

interface UserStorage {
    bookings: Booking[]
}

interface TimePeriod {
    startTime: string
    endTime: string
}

// Instantiate DialogFlow client
const app = dialogflow<{}, UserStorage>({debug: true})

app.intent(['welcome', 'booking.cancel'], (conv) => {
    if (conv.query.endsWith('WELCOME')) {
        firestore.init()
        // firestore.getBookingsFor('eniel16').then(result => {
        //     console.log(result)
        // }).catch(error => {
        //     console.log(error)
        // })
        // firestore.createBooking('_te_52183', ['eniel16', 'kdavi16'], new Date(), new Date()).then(result => {
        //     console.log(result)
        // }).catch(error => {
        //     console.log(error)
        // })

        conv.ask('Welcome, I am the SDU room booker. Would you like to book a room, or hear about your current bookings?')
    } else {
        conv.ask('Would you like to book a room, or hear about your current bookings?')
    }
    conv.contexts.set(ActionContexts.root, 1)
    conv.ask(new Suggestions('Book a room', 'View bookings'))
})

app.intent('booking.browse', (conv) => {
    conv.contexts.set(ActionContexts.booking, 1)
    conv.contexts.set(ActionContexts.booking_available, 1)
    conv.ask('Okay, how about ROOM')
})

app.intent(['booking', 'booking.different_time', 'view.book'], (conv) => {
    conv.contexts.set(ActionContexts.booking_expects_time, 1)
    conv.ask('When would you like to book a room?')
})

app.intent('booking.time', (conv) => {
    // TODO: convert to date objects, should work now
    const date = conv.parameters['date-time'] as string
    const period = conv.parameters['time-period'] as TimePeriod

    if (date && period) {
        const startDate = new Date(period.startTime)
        const endDate = new Date(period.endTime)

        return firestore.getAvailableRooms(startDate,endDate).then(roomResults => {
            if(roomResults.length > 0){
                const roomAvailable = roomResults[0].room
                conv.contexts.set(ActionContexts.booking_available, 1)
                 conv.contexts.set(ActionContexts.booking, 1, {
                     proposedRoom: roomAvailable,
                     date: date,
                     start: period.startTime,
                     end: period.endTime
                 })
                conv.ask('I have found ' + roomResults.length + ' available rooms. How about room ' + roomAvailable)
            }else {
                conv.contexts.set(ActionContexts.booking_unavailable, 1)
                conv.ask('I am sorry, but there are no available rooms at that time. Do you want to book a room at a different time?')
            }
        }).catch(error => {
            console.log(error)
        })

    }

    return
})

app.intent('booking.confirm_room', (conv) => {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        conv.contexts.set(ActionContexts.booking_expects_participant, 1)
        conv.contexts.set(ActionContexts.booking, 1, {
            room: ctx.parameters['proposedRoom'],
            date: ctx.parameters['date'],
            start: ctx.parameters['start'],
            end: ctx.parameters['end']
        })

        conv.ask('Alright! Who is the first person you want to add to your booking?')
    }
})

app.intent('booking.add_participant', (conv, {person: name}: { person: string }) => {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        let participants: string[]

        if (ctx.parameters['participants']) {
            participants = ctx.parameters['participants'] as string[]
            participants.push(name)
        } else {
            participants = [name]
        }

        conv.contexts.set(ActionContexts.booking_expects_participant, 1)
        conv.contexts.set(ActionContexts.booking, 1, {
            room: ctx.parameters['room'],
            date: ctx.parameters['date'],
            start: ctx.parameters['start'],
            end: ctx.parameters['end'],
            participants: participants
        })

        conv.ask('Anyone else you wish to add, or was that all?')
    }
})

app.intent('booking.complete', (conv) => {
    const ctx = conv.contexts.get('booking')
    if (ctx) {
        const booking: Booking = {
            room: ctx.parameters['room'] as string || 'ERROR',
            // TODO: Cannot store in user storage, I think
            // participants: ctx.parameters['participants'] as string[],
            date: ctx.parameters['date'] as string || 'ERROR',
            start: ctx.parameters['start'] as string || 'ERROR',
            end: ctx.parameters['end'] as string || 'ERROR'
        }

        if (!conv.user.storage.bookings) {
            conv.user.storage.bookings = [booking]
        } else {
            conv.user.storage.bookings.push(booking)
        }
    }

    conv.contexts.set(ActionContexts.root, 1)
    conv.ask('Your booking has been completed. ' +
        'Would you like to book another room, or hear about your current bookings?')
    conv.ask(new Suggestions('Book a room', 'View bookings'))
})

app.intent('view', (conv) => {
    conv.contexts.set(ActionContexts.view, 1)

    if (!conv.user.storage.bookings) {
        conv.ask('It looks like you don\'t have any bookings. Would your like to book a room?')
    } else {
        let prefix = ''
        let msg = 'Your bookings are '
        for (const booking of conv.user.storage.bookings) {
            msg += prefix
            msg += booking.room
            msg += ' on '
            msg += booking.date
            msg += ' from '
            msg += booking.start
            msg += ' to '
            msg += booking.end
            prefix = ' and '
        }
        msg += '. Would you like to book another room?'
        conv.ask(msg)
    }
})

// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
