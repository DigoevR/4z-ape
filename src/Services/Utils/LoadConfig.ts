import * as fs from "fs";
import * as dotenv from "dotenv";
import Logger from "./Logger";
import SleepSync from "./SleepSync";

export default class LoadConfig {
    constructor() {
        const path = fs.existsSync('.env') ? '.env' : '../.env';

        if (!fs.existsSync(path)) {
            new Logger('LoadConfig', false).error('.env file does not exist');
            SleepSync.ms(2000);
            process.exit(1);
        }

        dotenv.config({
            path,
        });
    }
}
