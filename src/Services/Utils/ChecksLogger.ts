import * as fs from "fs";
import Logger from "./Logger";

export default class ChecksLogger {
    public static shared: ChecksLogger = new ChecksLogger();

    private fileName: string = null;

    private map: Map<string, Array<string>> = new Map<string, Array<string>>()


    public add(token: string, line: string) {
        if (this.fileName === null) {
            return;
        }

        line = new Date().toISOString() + ' ' + line;

        const lines = this.map.get(token);
        if (lines === undefined) {
            this.map.set(token, [line]);
        } else {
            lines.push(line)
            this.map.set(token, lines);
        }
    }

    public flush(token: string) {
        if (this.fileName === null) {
            return;
        }

        const lines = this.map.get(token);
        if (lines === undefined) {
            return;
        }

        this.map.delete(token);

        fs.appendFileSync(this.fileName, token + '\n' + lines.join('\n') + '\n\n\n');
    }

    public static configure(): boolean {
        let fileName = Logger.fileName;

        if (fileName === null) {
            new Logger('ChecksLogger', false).log(`Logger isn't initialized`);
            return false;
        }

        fileName = fileName.replace('.log', '-checks.log');

        try {
            fs.writeFileSync(fileName, '');
            ChecksLogger.shared.fileName = fileName;
            new Logger('ChecksLogger', false).log(`Created ${fileName}`);
            return true;
        } catch (e) {
            new Logger('ChecksLogger', false).error(`Failed to create ${fileName}`, e);
            return false;
        }
    }
}
