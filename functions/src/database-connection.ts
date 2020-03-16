import * as admin from 'firebase-admin'

interface User {
    name: string
    email: string
    education: string
}

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
    return addRoomsToBookings(internalBookings)
}

export async function getAvailableRooms(start: Date, end: Date): Promise<Room[]> {
    //Get occupied rooms
    //First we get the bookings that end after our booking begins
    const bookingRefs = await admin.firestore().collection('bookings')
    // .where('end', '>', startTimestamp)
        .where('end', '>', start)
        .get()
    //Then we get the bookings that start before our booking ends
    //This is necessary, since we cannot make queries against multiple properties simultaneously
    const internalBookings = bookingRefs.docs.map(bookingRef => bookingRef.data() as InternalBooking)
        .filter(booking => booking.start.toDate() < end)
    const allBookings = await addRoomsToBookings(internalBookings)

    //Get all rooms
    const roomRefs = await admin.firestore().collection('rooms').get()
    const allRooms = roomRefs.docs.map(roomRef => roomRef.data() as Room)

    //Filter occupied rooms and return the rest
    return allRooms.filter(room => !allBookings.some(occupied => occupied.room === room.room))
}

async function addRoomsToBookings(internalBookings: InternalBooking[]): Promise<Booking[]> {
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

export async function createBooking(room: string, participants: string[], start: Date, end: Date) {
    return null
}

export async function getRelevantUsersByName(userRealName: string, context: User): Promise<User[]> {

}

export async function getUser(userName: string): Promise<User> {

}
