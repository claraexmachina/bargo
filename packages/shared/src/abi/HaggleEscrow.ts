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
      },
      {
        "name": "attestationRelayer_",
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
    "name": "attestationRelayer",
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
            "name": "agreedConditionsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "nearAiAttestationHash",
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
    "name": "setAttestationRelayer",
    "inputs": [
      {
        "name": "newRelayer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
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
        "name": "agreedConditionsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "nearAiAttestationHash",
        "type": "bytes32",
        "internalType": "bytes32"
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
    "name": "AttestationRelayerUpdated",
    "inputs": [
      {
        "name": "previous",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "current",
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
        "name": "nearAiAttestationHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "offerId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "agreedPrice",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "agreedConditionsHash",
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
    "name": "AttestationHashZero",
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
    "name": "NotRelayer",
    "inputs": []
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
