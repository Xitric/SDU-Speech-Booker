import * as functions from 'firebase-functions'
import {dialogflow, Suggestions, Permission, DialogflowConversation, Contexts} from 'actions-on-google'
import * as firestore from './database-connection'
import * as moment from 'moment'

const ActionContexts = {
    root: 'root',
    view: 'view',
    booking: 'booking',
    booking_expects_permission: 'booking_expects_permission',
    booking_expects_time: 'booking_expects_time',
    booking_available: 'booking_available',
    booking_unavailable: 'booking_unavailable',
    booking_browsing: 'booking_browsing',
    booking_expects_participant: 'booking_expects_participant',
    booking_expects_participant_confirmation: 'booking_expects_participant_confirmation',
    welcome_expects_permission: 'welcome_expects_permission'
}

interface Booking {
    room: string
    date: string
    start: string
    end: string
}

interface UserStorage {
    bookings: Booking[],
    name: string
    prefLoc: {
        lat: number,
        lon: number
    }
}

interface AvailableRooms {
    rooms: string[]
}

interface TimePeriod {
    startTime: string
    endTime: string
}

// Instantiate DialogFlow client
const app = dialogflow<AvailableRooms, UserStorage>({debug: true})

app.intent(['welcome', 'booking.cancel'], (conv) => {
    if (conv.query.endsWith('WELCOME')) {
        firestore.init()

        if (!conv.user.storage.name) {
            conv.contexts.set(ActionContexts.welcome_expects_permission, 1)
            conv.ask(new Permission({
                context: 'Welcome, I am the SDU room booker. To provide a personalized experience',
                permissions: 'NAME'
            }))
            return
        } else {
            conv.ask(`Welcome ${conv.user.storage.name}, I am the SDU room booker. Would you like to book a room, or hear about your current bookings?`)
        }
    } else {
        conv.ask('Would you like to book a room, or hear about your current bookings?')
    }

    conv.contexts.set(ActionContexts.root, 1)
    conv.ask(new Suggestions('Book a room', 'View bookings'))
})

app.intent('welcome.name_permission', (conv, _, permissionGranted) => {
    conv.contexts.set(ActionContexts.root, 1)

    if (!permissionGranted) {
        conv.ask('How do you expect to book a room when you won\'t let me know who you are? Now, would you like to book a room, or hear about your current bookings?')
    } else {
        conv.user.storage.name = conv.user.name.display || ''
        conv.ask(`Alright ${conv.user.storage.name}, would you like to book a room, or hear about your current bookings?`)
    }

    conv.ask(new Suggestions('Book a room', 'View bookings'))
})

app.intent('booking.browse', (conv) => {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        const rooms = ctx.parameters['availableRooms'] as firestore.Room[]
        if (rooms && rooms.length > 0) {
            const room = rooms.pop()

            conv.contexts.set(ActionContexts.booking_available, 1)
            conv.contexts.set(ActionContexts.booking, 1, {
                proposedRoom: room?.id,
                availableRooms: rooms,
                date: ctx.parameters['date'],
                start: ctx.parameters['start'],
                end: ctx.parameters['end']
            })

            conv.ask('Okay, how about ' + room?.name)
        } else {
            conv.contexts.set(ActionContexts.booking_unavailable, 1)
            conv.contexts.set(ActionContexts.booking, 1)
            conv.ask('I am sorry, but there are no other available rooms at that time. Do you want to book a room again?')
        }
    }
})

app.intent(['booking', 'booking.different_time', 'view.book'], (conv) => {
    if (!conv.user.storage.prefLoc) {
        conv.contexts.set(ActionContexts.booking_expects_permission, 1)
        conv.ask(new Permission({
            context: 'To provide better recommendations',
            permissions: 'DEVICE_PRECISE_LOCATION'
        }))
    } else {
        conv.contexts.set(ActionContexts.booking_expects_time, 1)
        conv.ask('When would you like to book a room?')
    }
})

app.intent('booking.location_permission', (conv, _, permissionGranted) => {
    conv.contexts.set(ActionContexts.booking_expects_time, 1)

    if (!permissionGranted) {
        conv.ask('Ok, no worries. When would you like to book a room?')
    } else {
        if (conv.device.location?.coordinates?.latitude &&
            conv.device.location.coordinates.longitude) {
            conv.user.storage.prefLoc = {
                lat: conv.device.location.coordinates.latitude,
                lon: conv.device.location.coordinates.longitude
            }
        }
        conv.ask('Brilliant. Now, when would you like to book a room?')
    }
})

app.intent('booking.time', (conv) => {
    const date = conv.parameters['date-time'] as string
    const period = conv.parameters['time-period'] as TimePeriod

    if (date && period) {
        const startDate = moment.parseZone(period.startTime).local(true).toDate()
        const endDate = moment.parseZone(period.endTime).local(true).toDate()

        return firestore.getAvailableRoomsByLocation(startDate, endDate, conv.user.storage.prefLoc).then(roomResults => {
            if (roomResults.length > 0) {
                const roomAvailable = roomResults.pop()
                conv.contexts.set(ActionContexts.booking_available, 1)
                conv.contexts.set(ActionContexts.booking, 1, {
                    proposedRoom: roomAvailable?.id,
                    availableRooms: roomResults,
                    date: date,
                    start: startDate,
                    end: endDate,
                })
                conv.ask('I have found ' + roomResults.length + ' available rooms. How about room ' + roomAvailable?.name)
            } else {
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

app.intent('booking.add_participant', (conv, person: { person: { name: string } }) => {
    const userName = person.person.name

    return firestore.getUser('kdavi16').then(user =>
        firestore.getRelevantUsersByName(userName, user).then(options => {
            const participantOptions = options.map(option => option.id)

            if (participantOptions.length === 0) {
                conv.contexts.set(ActionContexts.booking_expects_participant, 1)
                conv.contexts.set(ActionContexts.booking, 1, conv.contexts.get(ActionContexts.booking)?.parameters)
                conv.ask(`Sorry, I don't know any user named ${userName}. Is there anyone else you would like to add?`)
            } else if (participantOptions.length === 1) {
                addParticipantToBooking(participantOptions.pop() || '', conv)
                conv.ask('Anyone else you wish to add, or was that all?')
            } else {
                const ctx = conv.contexts.get(ActionContexts.booking)
                if (ctx) {
                    const possibility = participantOptions[0]
                    conv.contexts.set(ActionContexts.booking_expects_participant_confirmation, 1)
                    conv.contexts.set(ActionContexts.booking, 1, {
                        room: ctx.parameters['room'],
                        date: ctx.parameters['date'],
                        start: ctx.parameters['start'],
                        end: ctx.parameters['end'],
                        participants: ctx.parameters['participants'],
                        participantProposals: participantOptions
                    })
                    conv.ask(`Did you mean ${possibility}?`)
                }
            }
        })
    ).catch(error => console.log(error))
})

app.intent('booking.add_participant.confirm', (conv) => {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        const participant = (ctx.parameters['participantProposals'] as string[])[0]
        addParticipantToBooking(participant, conv)
        conv.ask('Anyone else you wish to add, or was that all?')
    }
})

app.intent('booking.add_participant.decline', (conv) => {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        const participantOptions = (ctx.parameters['participantProposals'] as string[]).slice(1)

        if (participantOptions.length === 0) {
            conv.contexts.set(ActionContexts.booking_expects_participant, 1)
            conv.contexts.set(ActionContexts.booking, 1, ctx.parameters)
            conv.ask('Sorry, I don\'t know who you mean then. Is there anyone else you would like to add?')
        } else {
            const possibility = participantOptions[0]
            conv.contexts.set(ActionContexts.booking_expects_participant_confirmation, 1)
            conv.contexts.set(ActionContexts.booking, 1, {
                room: ctx.parameters['room'],
                date: ctx.parameters['date'],
                start: ctx.parameters['start'],
                end: ctx.parameters['end'],
                participants: ctx.parameters['participants'],
                participantProposals: participantOptions
            })
            conv.ask(`How about ${possibility}, then?`)
        }
    }
})

function addParticipantToBooking(participant: string, conv: DialogflowConversation<{}, UserStorage, Contexts>) {
    const ctx = conv.contexts.get(ActionContexts.booking)
    if (ctx) {
        let participants: string[]

        if (ctx.parameters['participants']) {
            participants = ctx.parameters['participants'] as string[]
            participants.push(participant)
        } else {
            participants = [participant]
        }

        conv.contexts.set(ActionContexts.booking_expects_participant, 1)
        conv.contexts.set(ActionContexts.booking, 1, {
            room: ctx.parameters['room'],
            date: ctx.parameters['date'],
            start: ctx.parameters['start'],
            end: ctx.parameters['end'],
            participants: participants
        })
    }
}

app.intent('booking.complete', (conv) => {
    const ctx = conv.contexts.get('booking')

    if (ctx) {
        const room = ctx.parameters['room'] as string
        const date = new Date(ctx.parameters['date'] as string)
        const startDate = new Date(ctx.parameters['start'] as string)
        const endDate = new Date(ctx.parameters['end'] as string)
        const participants = ctx.parameters['participants'] as string[]

        startDate.setMonth(date.getMonth())
        startDate.setDate(date.getDate())
        startDate.setFullYear(date.getFullYear())
        endDate.setMonth(date.getMonth())
        endDate.setDate(date.getDate())
        endDate.setFullYear(date.getFullYear())

        return firestore.createBooking(room, participants, startDate, endDate).then(result => {
            conv.contexts.set(ActionContexts.root, 1)
            conv.ask('<speak><audio src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg"></audio>' +
                'Your booking has been completed. ' +
                'Would you like to book another room, or hear about your current bookings?</speak>')
            conv.ask(new Suggestions('Book a room', 'View bookings'))
        }).catch(error => {
            console.log(error)
        })
    }

    return
})

app.intent('view', (conv) => {
    conv.contexts.set(ActionContexts.view, 1)
    return firestore.getBookingsFor('kdavi16').then(bookings => {
        if (bookings.length > 0) {
            let prefix = ''
            let msg = 'Your bookings are '
            for (const booking of bookings) {
                const start = moment(booking.start)
                const end = moment(booking.end)

                msg += prefix
                msg += booking.room
                msg += ' on '
                msg += start.format('MMMM Do')
                msg += ' from '
                msg += start.format('h:mm')
                msg += ' to '
                msg += end.format('h:mm')
                prefix = ' and '
            }
            msg += '. Would you like to book another room?'
            conv.ask(msg)
        } else {
            conv.ask('It looks like you don\'t have any bookings. Would your like to book a room?')
        }
    })
})

// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
