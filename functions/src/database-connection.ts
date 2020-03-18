import * as admin from 'firebase-admin'

export interface User {
    name: string
    email: string
    education: string
}

export interface Room {
    room: string
}

export interface Booking {
    start: Date
    end: Date
    room: string
}

interface InternalBooking {
    start: admin.firestore.Timestamp
    end: admin.firestore.Timestamp
    room: admin.firestore.DocumentReference
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
    const roomRef = await admin.firestore().doc('rooms/' + room)
    const booking = await admin.firestore().collection('bookings').add({
        end: admin.firestore.Timestamp.fromDate(end),
        room: roomRef,
        start: admin.firestore.Timestamp.fromDate(start)
    })

    for (const participant of participants) {
        await admin.firestore().doc('users/' + participant).collection('bookings').doc(booking.id).create({})
    }
    return booking
}

export async function getRelevantUsersByName(userRealName: string, context: User): Promise<User[]> {
    const allUsers = await admin.firestore().collection('users').get()

    //It is definitely not users with a mismatching first name
    const firstName = userRealName.split(' ')[0]
    const filteredByFirstName = allUsers.docs.map(users => (users.data() as User)).filter(userResult => userResult.name.split(' ')[0] === firstName)

    //Matching last names are good indicators for relevance
    const lastNames = userRealName.split(' ').slice(1)
    const filteredByLastNames = arrangeByLastName(filteredByFirstName, lastNames)

    //It is less likely, but not impossible, to be someone from another education
    const likelyFilteredByEducation = arrangeByEducation(filteredByLastNames[0], context.education)
    const unlikelyFilteredByEducation = arrangeByEducation(filteredByLastNames[1], context.education)

    //Return most likely users followed by less likely ones
    return likelyFilteredByEducation[0]
        .concat(likelyFilteredByEducation[1])
        .concat(unlikelyFilteredByEducation[0])
        .concat(unlikelyFilteredByEducation[1])
}

function arrangeByEducation(users: User[], targetEducation: string): [User[], User[]] {
    const likelyUsers = users.filter(userResult => userResult.education === targetEducation)
    const unlikelyUsers = users.filter(userResult => !likelyUsers.includes(userResult))

    return [likelyUsers, unlikelyUsers]
}

function arrangeByLastName(users: User[], lastNames: string[]): [User[], User[]] {
    const likelyUsers = users.filter(userResult => lastNames.some(n => userResult.name.includes(n)))
    const unlikelyUsers = users.filter(userResult => !likelyUsers.includes(userResult))

    return [likelyUsers, unlikelyUsers]
}

export async function getUser(userName: string): Promise<User> {
    const userResult = await admin.firestore().collection('users').doc(userName).get()
    return userResult.data() as User
}
