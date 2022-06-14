//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../interfaces/ISuperPass.sol";
import "../interfaces/IRandomService.sol";
import "../libraries/LibGeneScience.sol";
import "../libraries/LibBreeding.sol";
import "../utils/LaunchpadNFT.sol";

/* solhint-disable */
contract UpgradeSuperPass is
    ISuperPass,
    ERC721EnumerableUpgradeable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    LaunchpadNFT
{
    using Strings for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using LibBreeding for SuperPass;
    using LibGeneScience for uint256;
    using LibGeneScience for uint8[];

    uint256 private constant MAX_CLASS_INDEX = 2; // = GOLD
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // @dev Max breed times (default 3)
    uint16 public maxBreedTimes;

    // USD token address
    address public busdToken;
    // SingSing token address
    address public singToken;
    // Treausry that receives fee and payments
    address public treasury;

    // Breeding fee in wei
    mapping(uint256 => uint256) public busdFee;
    mapping(uint256 => uint256) public singFee;

    /**
        @dev An array containing the SuperPass struct for all SuperPasses in existence. The ID
            of each pass is actually an index into this array.
     */
    SuperPass[] public superPasses;

    mapping(uint256 => uint256) public gen0CreatedCount;

    /**
        @dev Probability of child's class when breeding parents with same and different classes 
            - Key   : i * 2 + y
            - Value : p-value * 100     (if p = 25% then Value = 25)
     */
    mapping(uint256 => uint256) public diffClassProb;
    mapping(uint256 => uint256) public sameClassProb;
    /**
        @dev A mapping from SuperPassIDs to an address that has been approved to use
            this Pass for siring via breedWith(). Each Pass can only have one approved
            address for siring at any time. A zero value means no approval is outstanding.
     */
    mapping(uint256 => address) public sireAllowedToAddress;
    /**
        @dev A lookup table indicating the cooldown duration after any successful
            breeding action, called "pregnancy time" for matrons and "siring cooldown"
            for sires. Designed such that the cooldown roughly doubles each time a pass
            is bred, encouraging owners not to just keep breeding the same pass over
            and over again. Caps out at one week (a pass can breed an unbounded number
            of times, and the maximum cooldown is always seven days).
     */
    mapping(uint256 => uint256) public cooldowns;

    string public baseURI;

    IRegistry public randomService;

    function init(
        string memory _name,
        string memory _symbol,
        string memory _baseURI,
        address _busd,
        address _sing,
        address _treasury,
        address _randomService
    ) external initializer {
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ERC721_init(_name, _symbol);
        __ERC721Enumerable_init();

        address msgSender = _msgSender();
        _setupRole(DEFAULT_ADMIN_ROLE, msgSender);
        _setupRole(MINTER_ROLE, msgSender);
        require(
            _busd != address(0) &&
                _sing != address(0) &&
                _treasury != address(0),
            "Set address zero"
        );
        baseURI = _baseURI;
        busdToken = _busd;
        singToken = _sing;
        treasury = _treasury;
        randomService = IRegistry(_randomService);

        // Start with the mythical superpass 0 - so we don't have generation-0 parent issues
        _mintSuperPass(0, 0, 0, 0, 0, 0, msgSender);
        _burn(0);

        // Init class probability
        sameClassProb[0] = 60;
        sameClassProb[1] = 35;
        sameClassProb[2] = 5;
        sameClassProb[3] = 25;
        sameClassProb[4] = 60;
        sameClassProb[5] = 15;
        sameClassProb[6] = 5;
        sameClassProb[7] = 35;
        sameClassProb[8] = 60;

        diffClassProb[0] = 88;
        diffClassProb[1] = 10;
        diffClassProb[2] = 2;
        diffClassProb[3] = 75;
        diffClassProb[4] = 20;
        diffClassProb[5] = 5;
        diffClassProb[6] = 45;
        diffClassProb[7] = 35;
        diffClassProb[8] = 20;

        // Set max breeding times
        maxBreedTimes = 3;

        // Init setup breeding fee
        updateBreedingFees(0, 20 * 10**18, 400 * 10**18); // 20 BUSD + 400 SING
        updateBreedingFees(1, 20 * 10**18, 2000 * 10**18); // 20 BUSD + 2000 SING
        updateBreedingFees(2, 20 * 10**18, 3200 * 10**18); // 20 BUSD + 3200 SING
        // Set cooldowns
        cooldowns[0] = uint256(1 days);
        cooldowns[1] = uint256(2 days);
        cooldowns[2] = uint256(3 days);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(
            IERC165Upgradeable,
            ERC721EnumerableUpgradeable,
            AccessControlEnumerableUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256) public pure override returns (string memory) {
        revert("tokenURI() upgraded!");
    }

    function updateBaseURI(string calldata) external pure override {
        revert("updateBaseURI() upgraded!");
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }

    function pause() external pure {
        revert("pause() upgraded!");
    }

    function unpause() external pure {
        revert("unpause() upgraded!");
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721EnumerableUpgradeable) {
        super._beforeTokenTransfer(from, to, tokenId);

        require(!paused(), "NFT transfer while paused");

        // Once the superpass is transferred also clear sire allowances
        delete sireAllowedToAddress[tokenId];
    }

    function updateRandomService(address) external pure override {
        revert("updateRandomService() upgraded!");
    }

    function updateFeeTokenAddrs(address, address) external pure override {
        revert("updateFeeTokenAddrs() upgraded!");
    }

    function updateTreasury(address) external pure override {
        revert("updateTreasury() upgraded!");
    }

    function updateMaxBreedTimes(uint16) external pure override {
        revert("updateMaxBreedTimes() upgraded!");
    }

    function updateBreedingFees(
        uint256,
        uint256,
        uint256
    ) public pure override {
        if (1 == 1) revert("updateBreedingFees() upgraded!");
    }

    function updateCooldowns(uint256, uint256) external pure override {
        revert("updateCooldowns() upgraded!");
    }

    function updateSamePVal(
        uint8,
        uint8,
        uint8
    ) external pure override {
        revert("updateSamePVal() upgraded!");
    }

    function updateDiffPVal(
        uint8,
        uint8,
        uint8
    ) external pure override {
        revert("updateDiffPVal() upgraded!");
    }

    /**
        @dev Generate random number from Verichains random service
     */
    function getRandom() external pure returns (uint256) {
        revert("getRandom() upgraded!");
    }

    function rescueLostSuperPass(uint256, address) external pure override {
        revert("rescueLostSuperPass() upgraded!");
    }

    function mintSingle(
        uint256,
        uint256,
        uint8,
        address
    ) external pure override {
        revert("mintSingle() upgraded!");
    }

    /**
        @dev An internal method that creates a new superpass and stores it. This
            method doesn't do any checking and should only be called when the
            input data is known to be valid. Will generate both a Birth event
            and a Transfer event.
        @param _matronId The superpass ID of the matron of this pass (zero for gen0)
        @param _sireId The superpass ID of the sire of this pass (zero for gen0)
        @param _generation The generation number of this pass, must be computed by caller.
        @param _genes The superpass's genetic code.
        @param _singerId the superpass's singerId.
        @param _class The superpass's class.
        @param _owner The inital owner of this pass, must be non-zero (except for the unSuperPass, ID 0)
     */
    function _mintSuperPass(
        uint256 _matronId,
        uint256 _sireId,
        uint256 _generation,
        uint256 _genes,
        uint256 _singerId,
        uint8 _class,
        address _owner
    ) private returns (uint256) {
        SuperPass memory _superPass = SuperPass({
            genes: _genes,
            birthTime: block.timestamp,
            cooldownIndex: 0,
            cooldownEndTime: 0,
            matronId: _matronId,
            sireId: _sireId,
            siringWithId: 0,
            generation: _generation,
            singerId: _singerId,
            class: _class
        });
        superPasses.push(_superPass);
        uint256 superPassId = superPasses.length - 1;

        // emit the birth event
        emit Birth(
            _owner,
            superPassId,
            _superPass.matronId,
            _superPass.sireId,
            _superPass.singerId,
            _superPass.genes,
            _superPass.class
        );

        _safeMint(_owner, superPassId);
        return superPassId;
    }

    // ****************** BREEDING ******************
    function approveSiring(uint256, address) external pure override {
        revert("approveSiring() upgraded!");
    }

    function breedWith(uint256, uint256) external pure override {
        revert("breedWith() upgraded!");
    }

    function _breedWith(uint256 _matronId, uint256 _sireId) internal {
        // Grab a reference to the SuperPasses from storage.
        SuperPass storage sire = superPasses[_sireId];
        SuperPass storage matron = superPasses[_matronId];

        // Mark the matron as pregnant, keeping track of who the sire is.
        matron.siringWithId = _sireId;

        // Trigger the cooldown for both parents.
        sire._triggerCooldown(cooldowns[sire.cooldownIndex]);
        matron._triggerCooldown(cooldowns[matron.cooldownIndex]);

        // Clear siring permission for both parents. This may not be strictly necessary
        // but it's likely to avoid confusion!
        delete sireAllowedToAddress[_matronId];
        delete sireAllowedToAddress[_sireId];

        // Emit the pregnancy event.
        emit Pregnant(ownerOf(_matronId), _matronId, _sireId);
    }

    /**
        @dev Check if a sire has authorized breeding with this matron. True if both sire
            and matron have the same owner, or if the sire has given siring permission to
            the matron's owner (via approveSiring()).
     */
    function _isSiringPermitted(uint256 _sireId, uint256 _matronId)
        internal
        view
        returns (bool)
    {
        address matronOwner = ownerOf(_matronId);
        address sireOwner = ownerOf(_sireId);

        // Siring is okay if they have same owner, or if the matron's owner was given
        // permission to breed with this sire.
        return (matronOwner == sireOwner ||
            sireAllowedToAddress[_sireId] == matronOwner);
    }

    function isReadyToBreed(uint256) external pure override returns (bool) {
        revert("isReadyToBreed() upgraded!");
    }

    function giveBirth(uint256) external pure override returns (uint256) {
        revert("giveBirth() upgraded!");
    }

    function _generateClass(
        uint256 _matronClass,
        uint256 _sireClass,
        uint256 _random
    ) private view returns (uint8) {
        uint256[3] memory pVals;
        uint256 pSum;

        if (_matronClass == _sireClass) {
            for (uint256 i = 0; i <= MAX_CLASS_INDEX; i++) {
                pSum += sameClassProb[_matronClass * MAX_CLASS_INDEX + i];
                pVals[i] = pSum;
            }
        } else {
            if (_matronClass < _sireClass) _matronClass = _sireClass;

            for (uint256 i = 0; i <= MAX_CLASS_INDEX; i++) {
                pSum += diffClassProb[_matronClass * MAX_CLASS_INDEX + i];
                pVals[i] = pSum;
            }
        }

        _random %= pSum;
        if (_random < pVals[0]) return 0;
        if (_random < pVals[1]) return 1;
        return 2;
    }

    // ************** SUPPORT GALLER LAUNCHPAD **************
    function updateMaxLaunchpadSupply(uint256) external pure {
        revert("updateMaxLaunchpadSupply() upgraded!");
    }

    function updateLaunchpad(address) external pure {
        revert("updateLaunchpad() upgraded!");
    }

    function _mintTo(address, uint256) internal pure override(LaunchpadNFT) {
        revert("minTo() upgraded!");
    }
    // ************** SUPPORT GALLER LAUNCHPAD **************
    /* solhint-enable */
}
