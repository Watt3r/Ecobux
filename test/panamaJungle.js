const PanamaJungle = artifacts.require('./PanamaJungle.sol')
const EcoBucks = artifacts.require('./EcoBucks.sol')

//const numberToBN = require('number-to-bn');
const assert = require('assert')
const assertRevert = require('./utils/assertRevert').assertRevert;
const truffleAssert = require('truffle-assertions');
let contractInstance
let ecoBucksInstance

contract('PanamaJungle/EcoBucks', (accounts) => {
    beforeEach(async () => {
        ecoBucksInstance = await EcoBucks.deployed()
        contractInstance = await PanamaJungle.deployed(ecoBucksInstance.address)
    })

    it('should create multiple allotments and then get details of a specified allotment', async () => {
        // Create test allotment

        let details = await contractInstance.createTestAllotment()//, accounts[0])

        truffleAssert.eventEmitted(details, 'Birth');

    })

    it('should create and then get details of a purchasable microaddon', async () => {
        const price = 10
        const purchasable = 1

        const addonId = await contractInstance.createMicro(price, purchasable, {from: accounts[0]})

        assert.notEqual(price, addonId, 'The allotment geoPoints are not the same')
    })

    it('should create and then buy a purchasable microaddon', async () => {
        const price = 10
        const purchasable = 1

        let ecob = await ecoBucksInstance.createEco(accounts[0],1000)
        await ecoBucksInstance.approve(contractInstance.address, 1000)

        let addonId = await contractInstance.createMicro(price, purchasable, {from: accounts[0]})

        truffleAssert.eventEmitted(addonId, 'NewAddon', (ev) => {
            if (ev.addonId != 1 || ev.price != price || ev.purchasable !== true) return false

            let addonId = contractInstance.createMicro(price, purchasable, {from: accounts[0]})

            //let purchase = contractInstance.purchaseMicro(0, 1, {from: accounts[0]})
            //truffleAssert.eventEmitted(purchase, 'EcoTransfer');
            return true
        });

    })

    it('should create and then fail to buy a non purchasable microaddon', async () => {
        const price = 1
        const purchasable = 1

        let ecob = await ecoBucksInstance.createEco(accounts[0],1000)
        await ecoBucksInstance.approve(contractInstance.address, 1000)

        let allotment = await contractInstance.createTestAllotment()//, accounts[0])
        truffleAssert.eventEmitted(allotment, 'Birth');


        let addonId = await contractInstance.createMicro(price, purchasable, {from: accounts[0]})
        //let purchase =
        //await contractInstance.purchaseMicro(0, 0, {from: accounts[0]})
        // // truffleAssert.eventNotEmitted(purchase, 'EcoTransfer');
        return true


    })

})
