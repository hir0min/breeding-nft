//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/ISuperPass.sol";
import "./interfaces/IRandomService.sol";
import "./libraries/LibGeneScience.sol";
import "./libraries/LibBreeding.sol";
import "./utils/LaunchpadNFT.sol";

contract SuperPass is
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

    /**
     * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
     */
    function tokenURI(uint256 _tokenId)
        public
        view
        override
        returns (string memory _uri)
    {
        require(_exists(_tokenId), "URI query for nonexistent token");
        SuperPass storage superPass = superPasses[_tokenId];
        _uri = string(
            abi.encodePacked(
                baseURI,
                "/",
                superPass.singerId.toString(),
                "/",
                uint256(superPass.class).toString(),
                "/",
                _tokenId.toString(),
                "/",
                superPass.genes.toString()
            )
        );
    }

    /**
        @notice Update a new BaseURI
        @dev  Caller must be ADMIN
        @param _newBaseURI New string of BaseURI
    */
    function updateBaseURI(string calldata _newBaseURI)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(bytes(_newBaseURI).length != 0, "Empty URI");
        baseURI = _newBaseURI;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
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

    /**
        @notice Update new random service
        @dev    Caller must have DEFAULT_ADMIN_ROLE
        @param  _newService    Address of new random service
     */
    function updateRandomService(address _newService)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_newService != address(0), "Set zero address");
        require(_newService != address(randomService), "Address set already");
        randomService = IRegistry(_newService);
    }

    /**
        @dev Update new token addresses
        @notice Caller must be Owner
        @param _busd the address of BUSD token
        @param _sing the address of SingSing token
     */
    function updateFeeTokenAddrs(address _busd, address _sing)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_busd != address(0) && _sing != address(0), "Set zero address");
        busdToken = _busd;
        singToken = _sing;
    }

    /**
        @dev Update new treasury address
        @notice Caller must be Owner
        @param _addr the treasury address
     */
    function updateTreasury(address _addr)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_addr != address(0), "Set zero address");
        require(_addr != treasury, "Address set already");
        treasury = _addr;
    }

    /**
        @dev update max breed times
        @notice Caller must be ADMIN
        @param _max breed times to set
     */
    function updateMaxBreedTimes(uint16 _max)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // If breedTimes > maxBreedTimes the breeding fees are updated accordingly.
        if (_max > maxBreedTimes)
            for (uint256 i = maxBreedTimes; i < _max; i++) {
                busdFee[i] = (i + 1) * 10**19; // (i + 1) * 10 BUSD
                singFee[i] = 10**22; // 10000 SING
                cooldowns[i] = (2 * i + 1) * uint256(1 days);
            }
        maxBreedTimes = _max;
    }

    /**
        @dev Update breeding fees by cooldown index
        @notice Caller must be ADMIN
        @param _idx coolsdown index
        @param _busdFee fee in BUSD token
        @param _singFee fee in SingSing Token
     */
    function updateBreedingFees(
        uint256 _idx,
        uint256 _busdFee,
        uint256 _singFee
    ) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_idx < maxBreedTimes, "Out of bounds");
        busdFee[_idx] = _busdFee;
        singFee[_idx] = _singFee;
    }

    /**
        @dev Update cooldown after successful breeding
        @notice Caller must be ADMIN
        @param _idx index to update
        @param _value new value to update
     */
    function updateCooldowns(uint256 _idx, uint256 _value)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_idx < maxBreedTimes, "Idx must be < maxBreedTimes");
        cooldowns[_idx] = _value;
    }

    /**
        @dev Update chance rate from breeding parents with same classes
        @notice Caller must be ADMIN
        @param _matronClass Class of matron
        @param _sireClass Class of sire
        @param _pVal chance rate/probability
     */
    function updateSamePVal(
        uint8 _matronClass,
        uint8 _sireClass,
        uint8 _pVal
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        // max class index is 2 (gold)
        sameClassProb[_matronClass * MAX_CLASS_INDEX + _sireClass] = _pVal;
    }

    /**
        @dev Update chance rate from breeding parents with different classes
        @notice Caller must be ADMIN
        @param _matronClass Class of matron
        @param _sireClass Class of sire
        @param _pVal chance rate/probability
     */
    function updateDiffPVal(
        uint8 _matronClass,
        uint8 _sireClass,
        uint8 _pVal
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        // max class index is 2 (gold)
        diffClassProb[_matronClass * MAX_CLASS_INDEX + _sireClass] = _pVal;
    }

    /**
        @dev Generate random number from Verichains random service
     */
    function getRandom() internal returns (uint256) {
        uint256 key = 0xc9821440a2c2cc97acac89148ac13927dead00238693487a9c84dfe89e28a284;
        return randomService.randomService(key).random();
    }

    /**
        @dev Transfers a superpass owned by this contract to the specified address.
         Used to rescue lost superpasses. (There is no "proper" flow where this contract
         should be the owner of any SuperPass. This function exists for us to reassign
         the ownership of SuperPasses that users may have accidentally sent to our address.)
        @notice Caller must be ADMIN
        @param _superPassId - ID of superpass
        @param _recipient - Address to receive the lost pass
     */
    function rescueLostSuperPass(uint256 _superPassId, address _recipient)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            ownerOf(_superPassId) == address(this),
            "Contract doesn't own this pass"
        );
        _safeTransfer(address(this), _recipient, _superPassId, "");
    }

    function mintSingle(
        uint256 _singerId,
        uint256 _genes,
        uint8 _class,
        address _to
    ) external override whenNotPaused onlyRole(MINTER_ROLE) {
        // Limit number of superpass for each singer. Maximum is 300.
        require(
            gen0CreatedCount[_singerId] < 300,
            "Max gen0 limit exceed: 300"
        );
        gen0CreatedCount[_singerId]++;
        _mintSuperPass(0, 0, 0, _genes, _singerId, _class, _to);
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

    /**
        @notice Grants approval to another user to sire with one of your SuperPasses.
        @param _addr The address that will be able to sire with your SuperPass. Set to
            address(0) to clear all siring approvals for this SuperPass.
        @param _sireId A SuperPass that you own that _addr will now be able to sire with
     */
    function approveSiring(uint256 _sireId, address _addr)
        external
        override
        whenNotPaused
    {
        require(ownerOf(_sireId) == _msgSender(), "Caller must own the sire");
        sireAllowedToAddress[_sireId] = _addr;
    }

    /**
        @notice Breed a SuperPass you own (as matron) with a sire that you own, or for which you
            have previously been given Siring approval. Will either make your pass pregnant, or will
            fail entirely.
        @param _matronId The ID of the SuperPass acting as matron (will end up pregnant if successful)
        @param _sireId The ID of the SuperPass acting as sire (will begin its siring cooldown if successful)
     */
    function breedWith(uint256 _matronId, uint256 _sireId)
        external
        override
        whenNotPaused
    {
        // Caller must own the matron.
        require(
            ownerOf(_matronId) == _msgSender(),
            "Caller must own the matron"
        );

        // Neither sire nor matron are allowed to be on auction during a normal
        // breeding operation, but we don't need to check that explicitly.
        // For matron: The caller of this function can't be the owner of the matron
        //   because the owner of a SuperPass on auction is the auction house, and the
        //   auction house will never call breedWith().
        // For sire: Similarly, a sire on auction will be owned by the auction house
        //   and the act of transferring ownership will have cleared any oustanding
        //   siring approval.
        // Thus we don't need to spend gas explicitly checking to see if either pass
        // is on auction.

        // Check that matron and sire are both owned by caller, or that the sire
        // has given siring permission to caller (i.e. matron's owner).
        // Will fail for _sireId = 0
        require(
            _isSiringPermitted(_sireId, _matronId),
            "Siring is not permitted"
        );

        // Grab a reference to the potential matron
        SuperPass storage matron = superPasses[_matronId];

        // Check max breed times
        require(
            matron.cooldownIndex < maxBreedTimes,
            "Matron reached breeding limit"
        );

        // Make sure matron isn't pregnant, or in the middle of a siring cooldown
        require(matron._isReadyToBreed(), "Not ready to breed: matron");

        // Grab a reference to the potential sire
        SuperPass storage sire = superPasses[_sireId];

        // Check max breed times
        require(
            sire.cooldownIndex < maxBreedTimes,
            "Sire reached breeding limit"
        );

        // Make sure sire isn't pregnant, or in the middle of a siring cooldown
        require(sire._isReadyToBreed(), "Not ready to breed: sire");

        // Test that these passes are a valid mating pair.
        require(
            matron._isValidMatingPair(sire, _matronId, _sireId),
            "Not valid mating pair"
        );

        // Get breeding fees
        uint256 bFee = busdFee[matron.cooldownIndex];
        uint256 sFee = singFee[matron.cooldownIndex];

        address payment = treasury;

        // transfer fees to treasury
        if (treasury != address(0)) {
            address _msg = _msgSender();
            if (bFee > 0)
                IERC20Upgradeable(busdToken).safeTransferFrom(
                    _msg,
                    payment,
                    bFee
                );
            if (sFee > 0)
                IERC20Upgradeable(singToken).safeTransferFrom(
                    _msg,
                    payment,
                    sFee
                );
        }

        // All checks passed, superpass gets pregnant!
        _breedWith(_matronId, _sireId);
    }

    /**
        @dev Internal utility function to initiate breeding, assumes that all breeding
            requirements have been checked.
     */
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

    /**
        @notice Checks that a given superpass is able to breed (i.e. it is not pregnant or
            in the middle of a siring cooldown).
        @param _superpassId reference the id of the superpass, any user can inquire about it
     */
    function isReadyToBreed(uint256 _superpassId)
        external
        view
        override
        returns (bool)
    {
        require(_superpassId > 0, "Id 0 is invalid");
        SuperPass storage pass = superPasses[_superpassId];
        return pass._isReadyToBreed();
    }

    function giveBirth(uint256 _matronId)
        external
        override
        whenNotPaused
        returns (uint256)
    {
        // Grab a reference to the matron in storage.
        SuperPass storage matron = superPasses[_matronId];

        // Check that the matron is a valid super pass.
        require(matron.birthTime != 0, "Invalid birth time");

        // Check that the matron is pregnant, and that its time has come!
        require(matron._isReadyToGiveBirth(), "Not ready to birth: matron");

        // Grab a reference to the sire in storage.
        uint256 sireId = matron.siringWithId;
        SuperPass storage sire = superPasses[sireId];

        // Determine the higher generation number of the two parents
        uint256 parentGen = matron.generation;
        if (sire.generation > matron.generation) {
            parentGen = sire.generation;
        }

        // Request a random number from Verichain random service
        uint256 random = getRandom();

        // Call the sooper-sekret, sooper-expensive, gene mixing operation.
        uint256 childGenes = matron.genes.mixGenes(sire.genes, random);

        // Generate class for super pass
        uint8 class = _generateClass(matron.class, sire.class, random >> 42);

        address to;
        {
            to = ownerOf(_matronId);
        }
        // Mint new super pass
        uint256 superPassId = _mintSuperPass(
            _matronId,
            matron.siringWithId,
            parentGen + 1,
            childGenes,
            matron.singerId,
            class,
            to
        );

        // Clear the reference to sire from the matron (REQUIRED! Having siringWithId
        // set is what marks a matron as being pregnant.)
        delete matron.siringWithId;

        // return the new kitten's ID
        return superPassId;
    }

    // @dev pick class for breeding
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

    /**
        @dev Update max supply for launchpad
        @notice Caller must be ADMIN
        @param _maxSupply Max supply
     */
    function updateMaxLaunchpadSupply(uint256 _maxSupply)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_maxSupply > 0, "LaunchpadNFT: Max supply > 0");
        launchpadMaxSupply = _maxSupply;
    }

    /**
        @dev Update launchpad address
        @notice Caller must be ADMIN
        @param _addr galler launchpad address
     */
    function updateLaunchpad(address _addr)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_addr != address(0), "LaunchpadNFT: Set zero address");
        launchpad = _addr;
    }

    /**
        @dev Single mint for function `mintTo` from Galler Launchpad 
     */
    function _mintTo(address _to, uint256 _amount)
        internal
        override(LaunchpadNFT)
        onlyRole(MINTER_ROLE)
    {
        require(_to != address(0), "LaunchpadNFT: Set address zero");
        for (uint256 i = 0; i < _amount; i++) {
            // do round robin for singer ids
            uint256 singerId = uint32(launchpadSupply % 3);

            // check max gen creations following mintSuperPass
            require(
                gen0CreatedCount[singerId] < 300,
                "Max gen0 limit exceed: 300"
            );
            gen0CreatedCount[singerId]++;

            // generate random genes
            uint256 random = getRandom();
            uint8[] memory traits = new uint8[](7);
            for (uint256 j = 0; j < 7; j++) {
                traits[j] = uint8(random % 4);
                random = random >> 5;
            }

            uint256 genes = traits.encode();

            // mint SupperPass
            _mintSuperPass(0, 0, 0, genes, singerId, 1, _to); // class = 1 (silver)

            launchpadSupply++;
        }
    }
    // ************** SUPPORT GALLER LAUNCHPAD **************
}
