// Copyright (C) 2015, 2016, 2017 Dapphub

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Strings.sol";

contract TestLoop {
    string private _name;
    uint private _loopMax;

    constructor(string memory name_, uint loopMax_) {
        _name = name_;
        _loopMax = loopMax_;
    }

    function name() public view virtual returns (string memory) {
        return _name;
    }

    function setName(string memory newName) public {
        _name = newName;
    }

    function loopMax() public view virtual returns (uint) {
        return _loopMax;
    }

    function setLoopMax(uint newLoopMax) public {
        _loopMax = newLoopMax;
    }

    function loop() public returns(string memory){
        uint i = 1;
        uint c = 0;
        while(i == 1 && c < _loopMax){
            c = c+1;
            _name = string(abi.encodePacked("Loop Count: ", Strings.toString(c)));
        }
        return "Loop finished";
    }
}