import * as functions from 'firebase-functions'
import {dialogflow, Suggestions} from 'actions-on-google'

// Instantiate DialogFlow client
interface ItemData {
    names: [String]
    roomName: String
    date: Date
    startTime: Date
    endTime: Date

}

interface TimePeriod {
    startTime: string
    endTime: string
}

interface UserStorage {
    bookings: [ItemData]
}


const app = dialogflow<ItemData, UserStorage>({debug: true})

app.intent('welcome - current bookings', (conv) => {
    if(!conv.user.storage.bookings){
        conv.ask('No bookings available')
    }else{
        //let booking = 'Your bookings are '
        //for(let field of conv.user.storage.bookings){
        //    booking += field.roomName
        //    booking += ' on '
        //    booking += field.date
        //    booking += ' from '
        //    booking += field.startTime
        //    booking += ' to '
        //    booking += field.endTime
        //}
        conv.ask(''+conv.data.names)
    }

})

app.intent(['welcome', 'welcome - make booking - time - no'], (conv) => {
    const action = conv.action

    if (action === 'input.welcome') {
        conv.ask('Welcome, I am the SDU room booker. Would you like to book a room, or hear about your current bookings?')
    } else {
        conv.ask('Would you like to book a room, or hear about your current bookings?')
    }
    conv.ask(new Suggestions('Book a room', 'Current bookings'))
})

app.intent(['welcome - make booking', 'welcome - make booking - time - yes'], (conv) => {
    conv.ask(   'When would you like to book a room?')
})

app.intent('welcome - make booking - time', (conv) => {
    const dateTime = conv.parameters['date-time']
    const timePeriod = conv.parameters['time-period'] as TimePeriod
    if (dateTime && timePeriod) {
        //conv.contexts.set('makebooking-no-rooms', 2, {})
        //conv.ask('I am sorry, but there are no available rooms at that time. Do you want to book a room at a different time?')

       // conv.data.date = new Date(dateTime.toString())
       // conv.data.startTime = new Date(timePeriod.startTime)
        //conv.data.endTime = new Date(timePeriod.endTime)
        conv.data.roomName = '1.021'

        conv.contexts.set('makebooking-rooms', 2, {})
        conv.ask('I have found ten rooms at TEK. How about room 1.021?')

    }
})

app.intent('welcome - make booking - time - yes-2 - add person', (conv) => {
    let firstName = conv.parameters['first-name'] as String
    const lastName = conv.parameters['last-name']
    firstName += lastName? ' ' + lastName: ''

    if (!conv.data.names){
        conv.data.names = [firstName]
    } else {
        conv.data.names.push(firstName)
    }

    conv.ask('Do you want to add another person?' + conv.data.roomName)

})

app.intent('welcome - make booking - time - yes-2 - no', (conv) => {
    conv.ask('Your booking has been completed. ' +
        'Would you like to book another room or see your current bookings?')
    conv.contexts.set('welcome-followup', 2, {})

    let copyData: ItemData = {
        roomName: conv.data.roomName,
        date: conv.data.date,
        startTime: conv.data.startTime,
        endTime: conv.data.endTime,
        names: ['']

    }
    Object.assign(copyData, conv.data)

    if(!conv.user.storage.bookings) {
        conv.user.storage.bookings = [copyData]
    }else {
        conv.user.storage.bookings.push(copyData)
    }
})

// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
