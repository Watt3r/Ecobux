// SPDX-License-Identifier: AGPL-3.0
pragma solidity >=0.6.0;
import "./Ownable.sol";

/**
 * @title Pausable
 * @dev Base contract which allows children to implement an emergency stop mechanism.
 */
// solhint-disable-next-line
abstract contract Pausable is Ownable {
    event Pause();
    event Unpause();

    bool public paused = false;

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    modifier whenNotPaused() {
        require(!paused, "Function cannot be used while contract is paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     */
    modifier whenPaused() {
        require(paused, "Function cannot be used while contract is not paused");
        _;
    }

    /**
     * @dev called by the owner to pause, triggers stopped state
     */
    // solhint-disable-next-line no-simple-event-func-name
    function pause() public onlyOwner whenNotPaused {
        paused = true;
        emit Pause();
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    // solhint-disable-next-line no-simple-event-func-name
    function unpause() public onlyOwner whenPaused {
        paused = false;
        emit Unpause();
    }
}
