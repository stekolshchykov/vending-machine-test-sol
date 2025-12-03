// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract VendingMachineUnlimited {
    mapping(address => uint256) private _cupcakeBalances;

    // Выдать капкейк — можно вызывать сколько угодно раз, без ограничений по времени
    function giveCupcakeTo(address userAddress) public returns (bool success) {
        _cupcakeBalances[userAddress] += 1;
        return true;
    }

    // Прочитать баланс капкейков для адреса
    function getCupcakeBalanceFor(address userAddress)
        public
        view
        returns (uint256)
    {
        return _cupcakeBalances[userAddress];
    }
}
