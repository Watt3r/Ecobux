const {accounts, contract, web3} = require("@openzeppelin/test-environment");
const {expectEvent, expectRevert, constants} = require("@openzeppelin/test-helpers");
const gsn = require("@openzeppelin/gsn-helpers");
const {expect} = require("chai");
const {ZERO_ADDRESS} = constants;

// Load compiled artifacts
const EcoBux = contract.fromArtifact("EcoBux");
const EcoBuxFee = contract.fromArtifact("EcoBuxFee");
const MarketPlace = contract.fromArtifact("MarketPlace");
const Piloto = contract.fromArtifact("Piloto");

const [admin, seller, buyer, buyer2] = accounts;

// Price of each EcoBlock, in EcoBux
const blockPrice = 1500;
const ecoFee = 0.02;

/** @notice Function to buy EcoBlock(s) for seller
 * @dev Uses GSN in all cases
 * @param {int} amount number of EcoBlocks to buy
 */
async function buyEco(amount) {
  // Buy EcoBlock for seller
  await EcoBuxInstance.createEco(seller, blockPrice, {from: admin});
  await EcoBuxInstance.approve(PilotoInstance.address, blockPrice, {
    from: seller,
    useGSN: true,
  });
  await expect(
    (await EcoBuxInstance.allowance(seller, PilotoInstance.address)).toString()
  ).to.equal(blockPrice.toString());
  await PilotoInstance.buyEcoBlocks(amount, seller, {from: seller, useGSN: true});
}

// Start test block
describe("MarketPlace", function () {
  beforeEach(async function () {
    EcoBuxInstance = await EcoBux.new({from: admin});
    EcoBuxFeeInstance = await EcoBuxFee.new({from: admin});
    PilotoInstance = await Piloto.new(EcoBuxInstance.address, EcoBuxFeeInstance.address, {
      from: admin,
    });
    this.contract = await MarketPlace.new(EcoBuxInstance.address, EcoBuxFeeInstance.address, {
      from: admin,
    });

    // Fund contracts to cover gas cost
    await gsn.fundRecipient(web3, {recipient: EcoBuxInstance.address});
    await gsn.fundRecipient(web3, {recipient: PilotoInstance.address});
    await gsn.fundRecipient(web3, {recipient: this.contract.address});

    // Create a single EcoBlock
    EcoBlocks = require("./utils/EcoBlocks.json");
    EcoBlocks = EcoBlocks.slice(0, 1);

    const {tx} = await PilotoInstance.bulkCreateEcoBlocks(EcoBlocks.length, {
      from: admin,
      useGSN: false,
    });
    await expectEvent.inTransaction(tx, Piloto, "Transfer", {
      from: ZERO_ADDRESS,
      to: PilotoInstance.address,
    });
  });

  context("Create Order functions", async function () {
    it("create a new sell order", async function () {
      // Buy EcoBlock
      await buyEco(1);
      const ownedEcoBlock = 0;

      // Approve MarketPlace Contract to manage asset
      await PilotoInstance.approve(this.contract.address, ownedEcoBlock, {
        from: seller,
        useGSN: true,
      });

      // Create Sell Order
      const {tx} = await this.contract.createOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        blockPrice,
        {from: seller, useGSN: false}
      );
      await expectEvent.inTransaction(tx, MarketPlace, "OrderCreated", {
        assetId: ownedEcoBlock.toString(),
        assetOwner: seller,
        subTokenAddress: PilotoInstance.address,
        ecoPrice: blockPrice.toString(),
      });
    });
    it("fail to create order if subTokenAddr is not ERC721", async function () {
      // Bought EcoBlock 0
      await expectRevert(
        this.contract.createOrder(seller, 0, blockPrice, {from: seller}),
        "Address must be a contract"
      );
    });
    it("fail to create sell order if contract owns asset", async function () {
      // EcoBlock 0 is the only one available
      const ownedEcoBlock = 0;

      await expectRevert(
        this.contract.createOrder(PilotoInstance.address, ownedEcoBlock, blockPrice, {
          from: seller,
        }),
        "Only the owner can make orders"
      );
    });
    /* Fees must be covered as they are now a percentage of EcoBux, not const
    it('fail to create sell order if price doesnt cover fee', async function() {
      // Buy EcoBlock for seller
      await buyEco(1);

      // EcoBlock 0 is the only one available
      const ownedEcoBlock = 0;

      // Approve MarketPlace Contract to manage asset
      await PilotoInstance.approve(
          this.contract.address,
          ownedEcoBlock,
          {from: seller, useGSN: true},
      );

      await expectRevert(
          this.contract.createOrder(
              PilotoInstance.address,
              ownedEcoBlock,
              blockPrice,
              {from: seller},
          ),
          'Asset price does not cover fees',
      );
    });
    */
    it("fail to create order if owner not approve contract", async function () {
      // Buy EcoBlock for seller
      await buyEco(1);

      // EcoBlock 0 is the only one available
      const ownedEcoBlock = 0;

      await expectRevert(
        this.contract.createOrder(PilotoInstance.address, ownedEcoBlock, blockPrice, {
          from: seller,
        }),
        "The contract is not authorized to manage the asset"
      );
    });
  });
  context("Cancel Order functions", async function () {
    beforeEach(async function () {
      // Create Sell order from seller

      // Buy EcoBlock for seller
      await buyEco(1);

      // Bought EcoBlock 0
      ownedEcoBlock = 0;

      // Approve MarketPlace Contract to manage asset
      await PilotoInstance.approve(this.contract.address, ownedEcoBlock, {
        from: seller,
        useGSN: true,
      });

      // Create Sell Order
      const {tx} = await this.contract.createOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        blockPrice,
        {from: seller, useGSN: false}
      );
      await expectEvent.inTransaction(tx, MarketPlace, "OrderCreated", {
        assetId: ownedEcoBlock.toString(),
        assetOwner: seller,
        subTokenAddress: PilotoInstance.address,
        ecoPrice: blockPrice.toString(),
      });
    });
    it("cancel sell order", async function () {
      // Create Sell Order
      const {tx} = await this.contract.cancelOrder(PilotoInstance.address, ownedEcoBlock, {
        from: seller,
        useGSN: false,
      });
      // TODO: verify orderId is correct
      await expectEvent.inTransaction(tx, MarketPlace, "OrderCancelled", {
        assetId: ownedEcoBlock.toString(),
        seller: seller,
        subTokenAddress: PilotoInstance.address,
      });
    });
    it("fail to cancel sell order if not owner of order", async function () {
      await expectRevert(
        this.contract.cancelOrder(PilotoInstance.address, ownedEcoBlock, {from: buyer}),
        "Unauthorized user"
      );
    });
    it("fail to cancel sell order if asset not published", async function () {
      await expectRevert(
        this.contract.cancelOrder(PilotoInstance.address, 5138008, {from: buyer}),
        "Asset not published"
      );
    });
  });
  context("Execute Order functions", async function () {
    beforeEach(async function () {
      // Create Sell order from seller

      // Buy EcoBlock for seller
      await buyEco(1);

      // Bought EcoBlock 0
      ownedEcoBlock = 0;

      // Approve MarketPlace Contract to manage asset
      await PilotoInstance.approve(this.contract.address, ownedEcoBlock, {
        from: seller,
        useGSN: true,
      });

      // Create Sell Order
      const {tx} = await this.contract.createOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        blockPrice,
        {from: seller, useGSN: false}
      );
      await expectEvent.inTransaction(tx, MarketPlace, "OrderCreated", {
        assetId: ownedEcoBlock.toString(),
        assetOwner: seller,
        subTokenAddress: PilotoInstance.address,
        ecoPrice: blockPrice.toString(),
      });
    });
    it("execute sell order with a Fee", async function () {
      // Give buyer EcoBux
      await EcoBuxInstance.createEco(buyer, blockPrice, {from: admin});
      await EcoBuxInstance.approve(this.contract.address, blockPrice, {
        from: buyer,
        useGSN: true,
      });

      // Execute Sell Order
      const {tx} = await this.contract.executeOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        blockPrice,
        {from: buyer, useGSN: false}
      );
      // TODO: verify orderId is correct
      await expectEvent.inTransaction(tx, MarketPlace, "OrderSuccessful", {
        assetId: ownedEcoBlock.toString(),
        seller: seller,
        subTokenAddress: PilotoInstance.address,
        totalPrice: blockPrice.toString(),
        buyer: buyer,
      });
      // Verify EcoBux given to owner is correct & Amount taken from seller is correct
      expect((await EcoBuxInstance.balanceOf(seller)).toNumber()).to.equal(
        Math.ceil(blockPrice * 0.98)
      );
      expect((await EcoBuxInstance.balanceOf(buyer)).toNumber()).to.equal(0);
      expect((await EcoBuxInstance.balanceOf(EcoBuxFeeInstance.address)).toNumber()).to.equal(
        Math.floor(blockPrice * 0.01 + blockPrice * ecoFee)
      );
      expect((await EcoBuxInstance.balanceOf(PilotoInstance.address)).toNumber()).to.equal(
        Math.floor(blockPrice * 0.01) + (blockPrice - blockPrice * ecoFee)
      );
      // Add 25 because EcoBlock was purchased
    });
    it("execute sell order with larger fee", async function () {
      const ecoPrice = 50000; // Cost of sell order (500 EcoBux)
      // Create Sell Order
      await this.contract.createOrder(PilotoInstance.address, ownedEcoBlock, ecoPrice, {
        from: seller,
        useGSN: false,
      });

      // Give buyer EcoBux
      await EcoBuxInstance.createEco(buyer, ecoPrice, {from: admin});
      await EcoBuxInstance.approve(this.contract.address, ecoPrice, {
        from: buyer,
        useGSN: true,
      });

      // Execute Sell Order
      const {tx} = await this.contract.executeOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        ecoPrice,
        {from: buyer, useGSN: false}
      );
      // TODO: verify orderId is correct
      await expectEvent.inTransaction(tx, MarketPlace, "OrderSuccessful", {
        assetId: ownedEcoBlock.toString(),
        seller: seller,
        subTokenAddress: PilotoInstance.address,
        totalPrice: ecoPrice.toString(),
        buyer: buyer,
      });
      // Verify EcoBux given to owner is correct & Amount taken from seller is correct
      expect((await EcoBuxInstance.balanceOf(seller)).toNumber()).to.equal(
        Math.ceil(ecoPrice * 0.98)
      );
      expect((await EcoBuxInstance.balanceOf(buyer)).toNumber()).to.equal(0);
      expect((await EcoBuxInstance.balanceOf(EcoBuxFeeInstance.address)).toNumber()).to.equal(
        Math.floor(ecoPrice * 0.01 + blockPrice * ecoFee)
      );
      expect((await EcoBuxInstance.balanceOf(PilotoInstance.address)).toNumber()).to.equal(
        Math.floor(ecoPrice * 0.01) + (blockPrice - blockPrice * ecoFee)
      );
      // Add 25 because EcoBlock was purchased
    });
    it("execute sell order with no fee", async function () {
      ecoPrice = 5; // Cost of sell order (0.05 EcoBux)
      // Create Sell Order
      await this.contract.createOrder(PilotoInstance.address, ownedEcoBlock, ecoPrice, {
        from: seller,
        useGSN: false,
      });

      // Give buyer EcoBux
      await EcoBuxInstance.createEco(buyer, ecoPrice, {from: admin});
      await EcoBuxInstance.approve(this.contract.address, ecoPrice, {
        from: buyer,
        useGSN: true,
      });

      // Execute Sell Order
      const {tx} = await this.contract.executeOrder(
        PilotoInstance.address,
        ownedEcoBlock,
        ecoPrice,
        {from: buyer, useGSN: false}
      );
      // TODO: verify orderId is correct
      await expectEvent.inTransaction(tx, MarketPlace, "OrderSuccessful", {
        assetId: ownedEcoBlock.toString(),
        seller: seller,
        subTokenAddress: PilotoInstance.address,
        totalPrice: ecoPrice.toString(),
        buyer: buyer,
      });
      // Verify EcoBux given to owner is correct & Amount taken from seller is correct
      expect((await EcoBuxInstance.balanceOf(seller)).toNumber()).to.equal(
        Math.ceil(ecoPrice * 0.98)
      );
      expect((await EcoBuxInstance.balanceOf(buyer)).toNumber()).to.equal(0);
      expect((await EcoBuxInstance.balanceOf(EcoBuxFeeInstance.address)).toNumber()).to.equal(
        Math.floor(ecoPrice * 0.01 + blockPrice * ecoFee)
      );
      expect((await EcoBuxInstance.balanceOf(PilotoInstance.address)).toNumber()).to.equal(
        Math.floor(ecoPrice * 0.01) + (blockPrice - blockPrice * ecoFee)
      );
      // Add 25 because EcoBlock was purchased
    });
    it("fail to execute order if asset not published", async function () {
      await expectRevert(
        this.contract.executeOrder(
          PilotoInstance.address, // Subtoken Address
          5138008, // Nonexistant Asset ID
          blockPrice, // Price
          {from: buyer}
        ),
        "Asset not published"
      );
    });
    it("fail to execute order if seller tries to buy asset", async function () {
      await expectRevert(
        this.contract.executeOrder(
          PilotoInstance.address, // Subtoken Address
          ownedEcoBlock, // Asset ID
          blockPrice, // Price
          {from: seller}
        ),
        "Seller cannot buy asset"
      );
    });
    it("fail to execute order if incorrect price", async function () {
      await expectRevert(
        this.contract.executeOrder(
          PilotoInstance.address, // Subtoken Address
          ownedEcoBlock, // Asset ID
          1, // Incorrect Price
          {from: buyer}
        ),
        "The price is not correct"
      );
    });
    it("fail to execute order if buyer does not have EcoBux", async function () {
      await expectRevert(
        this.contract.executeOrder(
          PilotoInstance.address, // Subtoken Address
          ownedEcoBlock, // Asset ID
          blockPrice, // Price
          {from: buyer}
        ),
        "Not Enough EcoBux"
      );
    });
    it("fail to execute if seller is not owner of asset", async function () {
      // In this test, seller and buyer are corroborating to steal EcoBux

      // Approve buyer to take asset
      await PilotoInstance.approve(buyer, ownedEcoBlock, {from: seller});
      // buyer takes asset
      await PilotoInstance.safeTransferFrom(seller, buyer, ownedEcoBlock, {from: buyer});

      // Buyer2 Can no longer execute order
      await expectRevert(
        this.contract.executeOrder(
          PilotoInstance.address, // Subtoken Address
          ownedEcoBlock, // Asset ID
          blockPrice, // Price
          {from: buyer2}
        ),
        "The seller not the owner"
      );
    });
  });
});
