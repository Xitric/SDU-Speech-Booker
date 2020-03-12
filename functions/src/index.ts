import * as functions from 'firebase-functions'
import {dialogflow, Suggestions} from 'actions-on-google'

// Instantiate DialogFlow client
interface ItemData {
    item: object | undefined | string
}

const app = dialogflow<ItemData, {}>({debug: true})

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
    conv.ask('When do you want to book a room?',
        'When would you like to book a room?')
})

app.intent('welcome - make booking - time', (conv) => {
    const dateTime = conv.parameters['date-time']
    const timePeriod = conv.parameters['time-period']
    if (dateTime && timePeriod) {
        conv.contexts.set('makebooking-no-rooms', 5, {})
        conv.ask('I am sorry, but there are no available rooms at that time. Do you want to book a room at a different time?')
    }
})

// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
