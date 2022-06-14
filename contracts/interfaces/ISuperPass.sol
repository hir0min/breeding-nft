//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/IAccessControlEnumerableUpgradeable.sol";

interface ISuperPass is
    IERC721EnumerableUpgradeable,
    IERC721ReceiverUpgradeable
{
    struct SuperPass {
        /** 
            The SuperPass's genetic code is packed into these 256-bits.
            A pass's genes never change.
         */
        uint256 genes;
        // The timestamp from the block when this pass came into existence.
        uint256 birthTime;
        /**
            Set to the index in the cooldown array (see below) that represents
            the current cooldown duration for this SuperPass. This starts at zero
            for gen0 passes, and is initialized to floor(generation/2) for others.
            Incremented by one for each successful breeding action, regardless
            of whether this pass is acting as matron or sire.
         */
        uint256 cooldownIndex;
        /**
            The minimum timestamp after which this cat can engage in breeding
            activities again. This same timestamp is used for the pregnancy
            timer (for matrons) as well as the siring cooldown.
         */
        uint256 cooldownEndTime;
        // The ID of the parents of this superpass, set to 0 for gen0 passes.
        uint256 matronId;
        uint256 sireId;
        /** 
            Set to the ID of the sire pass for matrons that are pregnant,
            zero otherwise. A non-zero value here is how we know a pass
            is pregnant. Used to retrieve the genetic material for the new
            superpass when the birth transpires.
         */
        uint256 siringWithId;
        // Singer Id
        uint256 singerId;
        /**
            The "generation number" of this pass. Passes minted by the SuperPass contract
            for sale are called "gen0" and have a generation number of 0. The
            generation number of all other passes is the larger of the two generation
            numbers of their parents, plus one.
            (i.e. max(matron.generation, sire.generation) + 1)
         */
        uint256 generation;
        /**
            There're 3 SuperPass classes:
                - Bronze = 0
                - Silver = 1
                - Gold   = 2
         */
        uint8 class;
    }

    event Birth(
        address indexed owner,
        uint256 superPassId,
        uint256 matronId,
        uint256 sireId,
        uint256 singerId,
        uint256 genes,
        uint8 class
    );

    event Pregnant(address indexed owner, uint256 matronId, uint256 sireId);

    // ****************** FOR ADMIN ONLY ******************
    function updateRandomService(address _newService) external;

    function updateFeeTokenAddrs(address _busd, address _sing) external;

    function updateTreasury(address _addr) external;

    function updateMaxBreedTimes(uint16 _max) external;

    function updateBreedingFees(
        uint256 _idx,
        uint256 _busdFee,
        uint256 _singFee
    ) external;

    function updateCooldowns(uint256 _idx, uint256 _value) external;

    function updateSamePVal(
        uint8 _matronClass,
        uint8 _sireClass,
        uint8 _pVal
    ) external;

    function updateDiffPVal(
        uint8 _matronClass,
        uint8 _sireClass,
        uint8 _pVal
    ) external;

    function updateBaseURI(string calldata _newBaseURI) external;

    function rescueLostSuperPass(uint256 _superpassId, address _recipient)
        external;

    // ****************** FOR MINTER ******************
    function mintSingle(
        uint256 _singerId,
        uint256 _genes,
        uint8 _class,
        address _to
    ) external;

    // ****************** FOR USERS ******************
    function approveSiring(uint256 _sireId, address _addr) external;

    function breedWith(uint256 _matronId, uint256 _sireId) external;

    function isReadyToBreed(uint256 _superpassId) external returns (bool);

    function giveBirth(uint256 _matronId) external returns (uint256);
}
