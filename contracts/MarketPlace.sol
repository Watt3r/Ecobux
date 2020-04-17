pragma solidity ^0.6.0;

// Import OpenZeppelin's SafeMath Implementation
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./utils/Erc20.sol";
import "./utils/Erc721.sol";
import "./utils/Erc721Verifiable.sol";


contract MarketPlace {
    using SafeMath for uint256;
    ERC20 public ecoBux;
    ERC20 public ecoBuxFee;
    uint256 public projectFee;
    uint256 public charityFee;

    bytes4 public constant ERC721_INTERFACE = bytes4(0x80ac58cd);

    bytes4 public constant INTERFACEID_VALIDATEFINGERPRINT = bytes4(
        keccak256("verifyFingerprint(uint256,bytes)")
    );

    constructor(address _ecoBuxAddress, address _ecoBuxFeeAddress) public {
        ecoBux = ERC20(_ecoBuxAddress);
        ecoBuxFee = ERC20(_ecoBuxFeeAddress);
        projectFee = 10; // Base fee of every executed order, in EcoBux
        charityFee = 10; // Base fee of every executed order, in EcoBux
    }

    // EVENTS
    event OrderCreated(
        bytes32 id,
        uint256 indexed assetId,
        address indexed assetOwner,
        address subTokenAddress,
        uint256 ecoPrice
    );

    event OrderSuccessful(
        bytes32 id,
        uint256 indexed assetId,
        address indexed seller,
        address subTokenAddress,
        uint256 totalPrice,
        address indexed buyer
    );

    event OrderCancelled(
        bytes32 id,
        uint256 indexed assetId,
        address indexed seller,
        address subTokenAddress
    );

    event EcoTransfer(address owner, uint256 amount);

    struct Order {
        // Order ID
        bytes32 id;
        // Charity contract address
        address subTokenAddress;
        // Price (in ecob) for the published item
        uint256 price;
        // Owner of the asset
        address seller;
    }

    mapping(address => mapping(uint256 => Order)) public orderByAssetId;

    /** @dev Create order
     */
    function createOrder(
        address subTokenAddress,
        uint256 assetId,
        uint256 ecoPrice
    ) external {
        _requireERC721(subTokenAddress);

        ERC721 subToken = ERC721(subTokenAddress);
        address assetOwner = subToken.ownerOf(assetId);

        require(msg.sender == assetOwner, "Only the owner can make orders");
        require(
            ecoPrice > (projectFee+charityFee),
            "Asset price does not cover fees"
        );
        require(
            subToken.getApproved(assetId) == address(this) ||
                subToken.isApprovedForAll(assetOwner, address(this)),
            "The contract is not authorized to manage the asset"
        );

        bytes32 orderId = keccak256(
            abi.encodePacked(
                block.timestamp,
                assetOwner,
                assetId,
                subTokenAddress,
                ecoPrice
            )
        );

        orderByAssetId[subTokenAddress][assetId] = Order({
            id: orderId,
            subTokenAddress: subTokenAddress,
            price: ecoPrice,
            seller: assetOwner
        });

        emit OrderCreated(
            orderId,
            assetId,
            assetOwner,
            subTokenAddress,
            ecoPrice
        );
    }

    /** @dev Cancel existing order
     */
    function cancelOrder(address subTokenAddress, uint256 assetId)
        external
    {
        Order memory order = orderByAssetId[subTokenAddress][assetId];

        require(order.id != 0, "Asset not published");
        require(
            order.seller == msg.sender,
            "Unauthorized user"
        );

        bytes32 orderId = order.id;
        address orderSeller = order.seller;
        address orderTokenAddress = order.subTokenAddress;
        delete orderByAssetId[subTokenAddress][assetId];

        emit OrderCancelled(
            orderId,
            assetId,
            orderSeller,
            orderTokenAddress
        );
    }

    /** @dev Execute sale of order
     */
    function executeOrder(
        address subTokenAddress,
        uint256 assetId,
        uint256 price
        //bytes calldata fingerprint
    ) external {
        _requireERC721(subTokenAddress);

        ERC721Verifiable nftRegistry = ERC721Verifiable(subTokenAddress);

        //if (nftRegistry.supportsInterface(INTERFACEID_VALIDATEFINGERPRINT)) {
        //    require(
        //        nftRegistry.verifyFingerprint(assetId, fingerprint),
        //        "The asset fingerprint is not valid"
        //    );
        //}
        Order memory order = orderByAssetId[subTokenAddress][assetId];
        require(order.id != 0, "Asset not published");

        address seller = order.seller;
        require(seller != msg.sender, "Seller cannot buy asset");
        require(order.price == price, "The price is not correct");
        require(
            seller == nftRegistry.ownerOf(assetId),
            "The seller not the owner"
        );
        require(
            _availableECO(msg.sender) >= price, 
            "Not Enough EcoBux"
        );

        bytes32 orderId = order.id;
        delete orderByAssetId[subTokenAddress][assetId];

        // Transfer charity fee if exists
        if (charityFee > 0) {
            require(
                _takeEco(msg.sender, subTokenAddress, charityFee),
                "Transfering the charity fee to the charity failed"
            );
        }

        // Transfer project fee if exists
        if (projectFee > 0) {
            require(
                _takeEco(msg.sender, address(ecoBuxFee), projectFee),
                "Transfering the project fee to the EcoBux owner failed"
            );
        }

        // Transfer sale amount to seller
        require(
            _takeEco(msg.sender, seller, price.sub(projectFee + charityFee)),
            "Transfering the sale amount to the seller failed"
        );

        // Transfer asset owner
        nftRegistry.safeTransferFrom(seller, msg.sender, assetId);

        emit OrderSuccessful(
            orderId,
            assetId,
            seller,
            subTokenAddress,
            price,
            msg.sender
        );
    }

    function _requireERC721(address subTokenAddress) internal view {
        require(isContract(subTokenAddress), "Address must be a contract");

        ERC721 nftRegistry = ERC721(subTokenAddress);
        require(
            nftRegistry.supportsInterface(ERC721_INTERFACE),
            "Contract has an invalid ERC721 implementation"
        );
    }

    /** @dev Function to verifie user has enough EcoBux to spend
     */
    function _availableECO(address user) internal view returns (uint256) {
        return ecoBux.allowance(user, address(this));
    }

    /** @dev Function to take EcoBux from user and transfer to contract
     */
    function _takeEco(
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (bool) {
        require(_availableECO(_from) >= _amount, "Not enough EcoBux in takeEco");
        require(
            ecoBux.transferFrom(_from, _to, _amount),
            "Transfer of EcoBux failed"
        );
        emit EcoTransfer(_from, _amount);
        return true;
    }

    /** @dev Function determine if input is contract
     * @return bool if input is a contract
     */
    function isContract(address _addr) internal view returns (bool) {
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size > 0);
    }
}
