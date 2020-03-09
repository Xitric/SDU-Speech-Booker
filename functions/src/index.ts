import * as functions from 'firebase-functions'
import {dialogflow, Suggestions} from 'actions-on-google'

// Instantiate DialogFlow client
interface ItemData {
    item: object | undefined | string
}

const app = dialogflow<ItemData, {}>({debug: true})

app.intent('welcome', (conv) => {
    const action = conv.action

    if (action === 'input.welcome') {
        conv.ask('Welcome, I am the SDU room booker. Would you like to book a room, or hear about your current bookings?')
    } else {
        conv.ask('Would you like to book a room, or hear about your current bookings?')
    }
    conv.ask(new Suggestions('Book a room', 'Current bookings'))
})

app.intent('welcome - make booking - time', (conv) => {
    const dateTime = conv.parameters['date-time']
    const timePeriod = conv.parameters['time-period']
    console.log(dateTime)
    console.log(timePeriod)
})


// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
