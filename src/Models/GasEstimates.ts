export const GasEstimates = {
    get approveTX(): string {
        return process.env.MAX_GAS_APPROVE_TX;
    },
    get swapTX(): string {
        return process.env.MAX_GAS_SWAP_TX;
    },
    get approveReal(): string {
        return process.env.MAX_GAS_APPROVE_REAL;
    },
    get swapReal(): string {
        return process.env.MAX_GAS_SWAP_REAL;
    },
};