export default class SleepSync {
    static ms(t: number) {
        const start = new Date().getTime(), expire = start + t;
        while (new Date().getTime() < expire) { }
    }
}