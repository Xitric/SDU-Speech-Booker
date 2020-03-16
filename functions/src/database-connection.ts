import * as admin from 'firebase-admin'
import {user} from "firebase-functions/lib/providers/auth";
import {User} from "actions-on-google/dist/service/actionssdk/conversation/user";

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

export async function getAvailableRooms(start: Date, end: Date): Promise<Room[]> {

}

export async function getRelevantUsersByName(userRealName: string, context: User): Promise<User[]> {
    const allUsers = await admin.firestore().collection('users').get()
    const firstname = userRealName.split(' ') [0]
    const filteredUser = allUsers.docs.map(users => (users.data() as User) ).filter(userResult => userResult.name.split(' ') [0] === firstname)
    const matchedUsers = filteredUser.filter(matchUser => matchUser.education === context.education)
    return matchedUsers
}

export async function getUser(userName: string): Promise<User> {
    const userResult = await admin.firestore().collection('users').doc(userName).get()
    return userResult.data() as User
}
