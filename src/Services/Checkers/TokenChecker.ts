import Logger from "../Utils/Logger";
import BscScanChecker from "./BscScanChecker";
import StaySafuChecker from "./StaySafuChecker";
import HoneypotChecker from "./HoneypotChecker";
import ChecksLogger from "../Utils/ChecksLogger";

export default class TokenChecker {
    private logger: Logger = new Logger('TokenChecker', false);
    private repeatCount: number = parseInt(process.env.CHECK_REPEAT_COUNT);

    public async isGoodToken(token: string): Promise<boolean> {
        ChecksLogger.shared.add(token, `Check attempts to perform: ${this.repeatCount}`)

        const initialDelay = parseInt(process.env.CHECK_DELAY);
        const multipleChecksDelay = parseInt(process.env.CHECK_REPEAT_DELAY);

        ChecksLogger.shared.add(token, `Initial check delay: ${initialDelay} msec`)
        ChecksLogger.shared.add(token, `Delay between checks: ${multipleChecksDelay} msec`)

        await new Promise(resolve => setTimeout(resolve, initialDelay));

        let attempt = 0;
        let isGood = true;

        while (attempt < this.repeatCount) {
            this.logger.log(`${token}: started check #${attempt + 1}`);
            ChecksLogger.shared.add(token, `Started check #${attempt + 1}`);

            const r = await this._isGoodTokenSingle(token);

            this.logger.log(`${token}: check #${attempt + 1} is ${r}`);
            ChecksLogger.shared.add(token, `Check #${attempt + 1} is ${r}`);

            isGood = isGood && r;
            attempt++;

            if (attempt < this.repeatCount) {
                await new Promise(resolve => setTimeout(resolve, multipleChecksDelay));
            }
        }

        if (!isGood && process.env.AWAIT_LIQUIDITY_LOCK == 'true'){      //initiate liquidity loop (and checks)
            isGood = await this.isAlmostGood(token);
        }

        if (isGood) {
            this.logger.log(`${token}: OK`);
        } else {
            this.logger.log(`${token}: rejected, didn't pass checks`);
        }

        ChecksLogger.shared.add(token, `Checks result: ${isGood}`);
        return isGood;
    }

    private _isGoodTokenSingle(token: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const bscScanCheckPromise = new BscScanChecker().isGoodToken(token).catch(() => false);
            const staySafuCheckPromise = new StaySafuChecker().isGoodToken(token).catch(() => false);
            const honeypotPromise = new HoneypotChecker().isGoodToken(token).catch(() => false);

            Promise.all(
                [bscScanCheckPromise, honeypotPromise, staySafuCheckPromise],
            ).then(checks => {
                this.logger.log(`${token}: [BscScan:${checks[0]},Honeypot:${checks[1]},StaySAFU:${checks[2]}]`);
                let isGood = true;
                checks.forEach(value => {
                    isGood = isGood && value;
                });
                resolve(isGood);
            }).catch((e) => {
                resolve(false);
            })
        });
    }

    public async isAlmostGood(token: string): Promise<boolean> {
        const bscScanCheck = await new BscScanChecker().isGoodToken(token).catch(() => false);
        const honeypot = await new HoneypotChecker().isGoodToken(token).catch(() => false);
        const almostGood = bscScanCheck && honeypot;

        if (almostGood){
            return new StaySafuChecker().liquidityLoop(token);
        }
        else {
            return false;
        }
    }
}
