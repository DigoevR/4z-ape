# 4z-ape
Based on robo ape https://github.com/psdlt/roboape.

This bot monitors new bsc liquidiy pairs on pancakeswap and buys them, selling when profitable.

dditional features:

checks new token's liquidity status (locked/unlocked), ownership status, buy/sell tax and looks for known scams in contract using staysafu.org

sells token if liquidity has been unlocked

if new token has passed all checks, but liquidity has not been locked yet, can wait for liquidity to lock before buying
