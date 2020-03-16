import * as admin from 'firebase-admin'

// interface User {
//     name: string
//     email: string
//     education: string
// }

interface InternalBooking {
    start: admin.firestore.Timestamp
    end: admin.firestore.Timestamp
    room: admin.firestore.DocumentReference
}

export interface Booking {
    start: Date
    end: Date
    room: string
}

export interface Room {
    room: string
}

export function init() {
    if (!admin.apps.length) {
        admin.initializeApp()
    }
}

export async function getBookingsFor(userName: string): Promise<Booking[]> {
    const userResult = await admin.firestore().collection('users/' + userName + '/bookings').listDocuments()
    const bookingIds = userResult.map(bookingRef => bookingRef.id)

    const bookingRefs = await admin.firestore().collection('bookings').listDocuments()
    const bookingPromises = bookingRefs.filter(bookingRef => bookingIds.includes(bookingRef.id)).map(bookingRef => {
        return admin.firestore().collection('bookings').doc(bookingRef.id).get()
    })

    const internalBookings = (await Promise.all(bookingPromises)).map(bookingResult => bookingResult.data() as InternalBooking)
    const bookingRoomPromises = internalBookings.map(internalBooking => {
        return new Promise<Booking>((resolve, reject) => {
            admin.firestore().collection('rooms').doc(internalBooking.room.id).get().then(roomResult => {
                resolve({
                    start: internalBooking.start.toDate(),
                    end: internalBooking.end.toDate(),
                    room: (roomResult.data() as Room).room
                })
            }).catch(error => {
                reject(error)
            })
        })
    })
    return await Promise.all(bookingRoomPromises)
}
