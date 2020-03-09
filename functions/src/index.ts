import * as functions from 'firebase-functions'
import {dialogflow, Suggestions} from 'actions-on-google'

// Instantiate DialogFlow client
interface ItemData {
    item: object | undefined | string
}

const app = dialogflow<ItemData, {}>({debug: true})

app.intent('out of items', (conv, {item}) => {
    //Store item in user data?
    conv.data.item = item
    conv.ask(`Would you like to add ${item} to your shopping list?`)
    conv.ask(new Suggestions('Yes', 'No'))
})

app.intent('discounts - yes', (conv) => {
    //Retrieve item from user data?
    conv.close(`Sorry, no discounts available on ${conv.data.item}!`)
})

// Handle HTTPS POST requests
export const fulfillment = functions.https.onRequest(app)
