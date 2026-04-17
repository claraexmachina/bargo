// Auto-generated from forge build. Do NOT hand-edit.
export const haggleEscrowAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "karmaReader_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rlnVerifier_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "HIGH_VALUE_THRESHOLD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SETTLEMENT_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activeNegotiations",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "addEnclaveSigner",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelOffer",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "confirmMeetup",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "enclaveSigner",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getDeal",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct HaggleEscrow.Deal",
        "components": [
          {
            "name": "listingId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "offerId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "buyer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "agreedPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "attestationHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "enclaveId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum HaggleEscrow.DealState"
          },
          {
            "name": "createdAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lockedUntil",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getListing",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct HaggleEscrow.Listing",
        "components": [
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "askPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredKarmaTier",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "itemMetaHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "createdAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "karmaReader",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IKarmaReader"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lockEscrow",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerListing",
    "inputs": [
      {
        "name": "askPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requiredKarmaTier",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "itemMetaHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reportNoShow",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rlnVerifier",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IRLNVerifier"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleNegotiation",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "offerId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agreedPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "attestationHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "enclaveId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "teeSignature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitOffer",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "bidPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "rlnProof",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "offerId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "EIP712DomainChanged",
    "inputs": [],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EnclaveSignerAdded",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EscrowLocked",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsRefunded",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FundsReleased",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "seller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ListingCreated",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "seller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "askPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "requiredKarmaTier",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "itemMetaHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MeetupConfirmed",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NegotiationSettled",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "listingId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "offerId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "agreedPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "enclaveId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "attestationHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NoShowReported",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "reporter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "accused",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferSubmitted",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "offerId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bidPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "rlnNullifier",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ThroughputExceededEvent",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "current",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyConfirmed",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AttestationSigInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DealNotLocked",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "DealNotPending",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "KarmaTierBelowRequired",
    "inputs": [
      {
        "name": "have",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "need",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "ListingNotActive",
    "inputs": [
      {
        "name": "listingId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotParticipant",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "RLNProofInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SettlementWindowOpen",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "ThroughputExceeded",
    "inputs": [
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "current",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownEnclave",
    "inputs": [
      {
        "name": "enclaveId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "WrongEscrowAmount",
    "inputs": [
      {
        "name": "sent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const;
