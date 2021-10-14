import * as fs from "fs";

export default class Logger {
    public static fileName: string = null;

    constructor(private name: string, private isVerbose: boolean) {}

    public log(line: string) {
        if (process.env.VERBOSE_LOGS !== 'true') {
            if (this.isVerbose) {
                return;
            }
        }

        const date = new Date();
        const str = `[${this.name}] ${line}`;

        Logger._log(date, str);
    }

    public error(line: string, exception: any = null) {
        if (process.env.VERBOSE_LOGS !== 'true') {
            if (this.isVerbose) {
                return;
            }
        }

        const date = new Date();
        const str = `[${this.name}] ${line}`;

        Logger._log(date, str);

        if (exception) {
            Logger._error(exception);
        }
    }

    private static _log(date: Date, line: string) {
        console.log(date, line);
        Logger.logToFile(date.toISOString() + ' ' + line);
    }

    private static _error(exc: any) {
        console.error(exc);
        Logger.errorToFile(exc);
    }

    private static logToFile(s: string) {
        if (Logger.fileName != null) {
            fs.appendFileSync(Logger.fileName, s + '\n');
        }
    }

    private static errorToFile(exc: any) {
        if (Logger.fileName != null) {
            fs.appendFileSync(Logger.fileName, `${exc.stack} ${JSON.stringify(exc, null, "  ")}\n`);
        }
    }

    public static configureLogFile() {
        const date = new Date();
        const dateStr = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;

        if (!fs.existsSync('./logs')) {
            fs.mkdirSync('./logs');
        }

        let num = 1;

        let fileName = `logs/${dateStr}-${num}.log`;
        while (fs.existsSync(fileName)) {
            num++;
            fileName = `logs/${dateStr}-${num}.log`;
        }

        if (Logger.fileName == null) {
            try {
                fs.writeFileSync(fileName, '');
                Logger.fileName = fileName;
                new Logger('Logger', false).log(`Created ${fileName}`);
            } catch (e) {
                new Logger('Logger', false).error(`Failed to create ${fileName}`, e);
            }
        }
    }
}
