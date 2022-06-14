# Breeding NFT
## Features
- NFT721 support breeding system
- Integrate VRF
- Contract upgradeable
- Support Galler Launchpad [[ref](https://galler.readme.io/docs/launchpad-specification)]
## Set up
Node >= 10.x && yarn > 1.x
```
$ node --version
v16.15.0

$ npm install --global yarn

$ yarn --version
1.22.18
```

Install dependencies
```
$ yarn
```
## Test
1. Compile contract
```
$ yarn compile
```
2. Run tests
```
$ yarn test
```
## Solidity linter and prettiers
1. Run linter to analyze convention and security for smart contracts
```
$ yarn sol:linter
```
2. Format smart contracts
```
$ yarn sol:prettier
```
3. Format typescript scripts for unit tests, deployment and upgrade
```
$ yarn ts:prettier
```

* Note: Updated husky hook for pre-commit
## Testnet deployment
1. Config `.env`
```
ADMIN_PRIVATE_KEY=<admin private key>
TREASURY_ADDR=<treasury address>
MINTER_ADDR=<minter address>
BASE_URI=<superpass base uri>
```
2. Deploy on BSC Testnet
```
$ yarn deploy:bsctest
```

## Mainnet deployment
1. Config `.env`
```
ADMIN_PRIVATE_KEY=<admin private key>
TREASURY_ADDR=<treasury address>
MINTER_ADDR=<minter address>
BUSD_ADDR=<busd erc20 address>
SING_ADDR=<sing erc20 address>
BASE_URI=<superpass base uri>
```
2. Deploy on BSC Mainnet
```
$ yarn deploy:mainnet
```
***Note***: After the first deployment succeed, please save and keep file `.oppenzeppelin` private since it's important to upgrade contract later.
## Upgrade smart contracts
1. Clean cache and precompiled folders to avoid conflict errors
```
$ rm -rf artifacts cache .oppenzeppelin
```
2. Put your folder `.oppenzeppelin` into root directory
3. Update your smart contracts
4. Run upgrade via `ProxyAdmin` contract

```
$ yarn upgrade:testnet
```
OR

```
$ yarn upgrade:mainnet
```

For more information, you can check this link [here](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies).