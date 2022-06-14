// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ISuperPass.sol";

library LibBreeding {
    /**
        @dev Checks that a given pass is able to breed (i.e. it is not pregnant or
            in the middle of a siring cooldown).
        @param _superPass reference the id of the superpass, any user can inquire about it
    
     */
    function _isReadyToBreed(ISuperPass.SuperPass storage _superPass)
        internal
        view
        returns (bool)
    {
        return
            (_superPass.siringWithId == 0) &&
            (_superPass.cooldownEndTime <= block.timestamp);
    }

    /**
        @dev Checks to see if a given SuperPass is pregnant and (if so) if the gestation
            period has passed.
     */
    function _isReadyToGiveBirth(ISuperPass.SuperPass storage _matron)
        internal
        view
        returns (bool)
    {
        return
            (_matron.siringWithId != 0) &&
            (_matron.cooldownEndTime <= block.timestamp);
    }

    /**
        @dev Internal check to see if a given sire and matron are a valid mating pair. DOES NOT
            check ownership permissions (that is up to the caller).
        @param _matron A reference to the SuperPass struct of the potential matron.
        @param _matronId The matron's ID.
        @param _sire A reference to the SuperPass struct of the potential sire.
        @param _sireId The sire's ID
     */
    function _isValidMatingPair(
        ISuperPass.SuperPass storage _matron,
        ISuperPass.SuperPass storage _sire,
        uint256 _matronId,
        uint256 _sireId
    ) internal view returns (bool) {
        // A SuperPass can't breed with itself!
        if (_matronId == _sireId) {
            return false;
        }

        // A SuperPass must be from same Singer
        if (_matron.singerId != _sire.singerId) {
            return false;
        }

        // SuperPasses can't breed with their parents.
        if (_matron.matronId == _sireId || _matron.sireId == _sireId) {
            return false;
        }
        if (_sire.matronId == _matronId || _sire.sireId == _matronId) {
            return false;
        }

        // We can short circuit the sibling check (below) if either pass is
        // gen zero (has a matron ID of zero).
        if (_sire.matronId == 0 || _matron.matronId == 0) {
            return true;
        }

        // SuperPasses can't breed with full or half siblings.
        if (
            _sire.matronId == _matron.matronId ||
            _sire.matronId == _matron.sireId
        ) {
            return false;
        }
        if (
            _sire.sireId == _matron.matronId || _sire.sireId == _matron.sireId
        ) {
            return false;
        }

        // Everything seems cool! Let's get DTF.
        return true;
    }

    /**
        @dev Set the cooldownEndTime for the given SuperPass, based on its current cooldownIndex.
        Also increments the cooldownIndex (unless it has hit the cap).
        @param _superPass A reference to the SuperPass in storage which needs its timer started.
     */
    function _triggerCooldown(
        ISuperPass.SuperPass storage _superPass,
        uint256 _cooldown
    ) internal {
        // Compute the end of the cooldown time (based on current cooldownIndex)
        _superPass.cooldownEndTime = block.timestamp + _cooldown;

        // Increment the breeding count, clamping it at 4, which is the length of the
        // cooldowns array. We could check the array size dynamically, but hard-coding
        // this as a constant saves gas. Yay, Solidity!
        if (_superPass.cooldownIndex < 4) _superPass.cooldownIndex += 1;
    }
}
