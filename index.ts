import { Ed25519Keypair, Connection, Transaction } from "bigchaindb-driver";
import { zencode_exec } from "zenroom";
import { ZenroomSha256, Fulfillment } from "crypto-conditions"
import * as bs58 from 'bs58';
import {default as stringify} from 'json-stable-stringify';
import { sha3_256 } from 'js-sha3';
import { Connection as PlanetmintConnection } from 'bigchaindb-driver';

const CONDITION_SCRIPT =
    `Scenario 'qp': create the signature of an object
    Given I have the 'keyring'
    Given that I have a 'string dictionary' named 'houses' inside 'asset'
    When I create the dilithium signature of 'houses'
    Then print the 'dilithium signature'`

const FULFILL_SCRIPT =
    `Scenario 'qp': Bob verifies the signature from Alice
    Given I have a 'dilithium public key' from 'Alice'
    Given that I have a 'string dictionary' named 'houses' inside 'asset'
    Given I have a 'dilithium signature' named 'dilithium signature' inside 'result'
    When I verify the 'houses' has a dilithium signature in 'dilithium signature' by 'Alice'
    Then print the string 'ok'`

const SK_TO_PK =
    `Scenario 'qp': Create the keypair
    Given that I am known as 'Alice'
    Given I have the 'keyring'
    When I create the dilithium public key
    Then print my 'dilithium public key'`

const GENERATE_KEYPAIR =
    `Scenario 'qp': Create the keypair
    Given that I am known as 'Pippo'
    When I create the dilithium key
    Then print data`

const ZENROOM_DATA = {
    'also': 'more data'
}

const HOUSE_ASSETS = {
    "data": {
        "houses": [
            {
                "name": "Harry",
                "team": "Gryffindor",
            },
            {
                "name": "Draco",
                "team": "Slytherin",
            }
        ],
    }
}
const metadata = {
    'units': 300,
    'type': 'KG'
}
const broadcastTx = async () => {
  const biolabs = new Ed25519Keypair();
  const version = "2.0";

  const alice = JSON.parse((await zencode_exec(GENERATE_KEYPAIR)).result)['keyring']
  console.log(alice)

  const zen_public_keys = JSON.parse((await zencode_exec(SK_TO_PK,
    {keys: JSON.stringify({'keyring': alice})})).result)

  const asset = HOUSE_ASSETS;
  const metadata = {"result": {"output": ["ok"]}};
  const zenroomscpt = new ZenroomSha256();
  zenroomscpt.setScript(FULFILL_SCRIPT);
  zenroomscpt.setData(ZENROOM_DATA);
  zenroomscpt.setKeys(zen_public_keys);
  console.log(zenroomscpt)

  const condition_uri_zen = zenroomscpt.getCondition().serializeUri()
  console.log(`zenroom condition URI: ${condition_uri_zen}`)


  const unsigned_fulfillment_dict_zen = {
    'type': zenroomscpt.getTypeId(),
    'public_key': bs58.encode(Buffer.from(biolabs.publicKey, 'utf-8'))
  }
  const output = {
    'amount': '10',
    'condition': {
      'details': unsigned_fulfillment_dict_zen,
      'uri': condition_uri_zen,

    },
    'public_keys': [biolabs.publicKey,],
  }
  const input_ = {
    'fulfillment': null,
    'fulfills': null,
    'owners_before': [biolabs.publicKey,]
  }

  const token_creation_tx = {
    'operation': 'CREATE',
    'asset': HOUSE_ASSETS,
    'metadata': metadata,
    'outputs': [output,],
    'inputs': [input_,],
    'version': version,
    'id': null,
  };

  // sign fulfillment


  let message = Buffer.from(stringify(token_creation_tx))
  try {
    if(await zenroomscpt.validate(message)) {
      console.log(">>>> Message validated even if it is not signed <<<<<");
      return;
    }
  } catch(e) {
    console.log("Validation of not signed message generated an exception, all good")
  }
  message = await zenroomscpt.sign(message, CONDITION_SCRIPT, alice);
  if(!await zenroomscpt.validate(message)) {
    console.log(">>>> Signed message not validated <<<<<");
    return;
  }
  const messageSigned = JSON.parse(message.toString())
  const fulfillment_uri = zenroomscpt.serializeUri();

  console.log(`Fulfillment URI: ${fulfillment_uri}`);

  messageSigned.inputs[0].fulfillment = fulfillment_uri;
  const tx = {id: null, ...messageSigned}

  const jsonStrTx = stringify(messageSigned)


  const shared_creation_txid = sha3_256(Buffer.from(jsonStrTx).toString('hex'))
  const messageFinal = {id: shared_creation_txid, ...messageSigned}
  console.log();

  const plntmnt = new PlanetmintConnection('https://test.ipdb.io')
  const ff_from_uri = Fulfillment.fromUri(fulfillment_uri)
  console.log(ff_from_uri)

}
broadcastTx()
//console.log(Fulfillment.fromUri("pYIC-ICCAWUKICAgIFNjZW5hcmlvICdlY2RoJzogQm9iIHZlcmlmaWVzIHRoZSBzaWduYXR1cmUgZnJvbSBBbGljZQogICAgR2l2ZW4gSSBoYXZlIGEgJ2VjZGggcHVibGljIGtleScgZnJvbSAnQWxpY2UnCiAgICBHaXZlbiB0aGF0IEkgaGF2ZSBhICdzdHJpbmcgZGljdGlvbmFyeScgbmFtZWQgJ2hvdXNlcycgaW5zaWRlICdhc3NldCcKICAgIEdpdmVuIEkgaGF2ZSBhICdzaWduYXR1cmUnIG5hbWVkICdzaWduYXR1cmUnIGluc2lkZSAncmVzdWx0JwogICAgV2hlbiBJIHZlcmlmeSB0aGUgJ2hvdXNlcycgaGFzIGEgc2lnbmF0dXJlIGluICdzaWduYXR1cmUnIGJ5ICdBbGljZScKICAgIFRoZW4gcHJpbnQgdGhlIHN0cmluZyAnb2snCiAgICCBFXsiYWxzbyI6ICJtb3JlIGRhdGEifYGCAXR7IkFsaWNlIjogeyJlY2RoX3B1YmxpY19rZXkiOiAiQk9EVVU1Vm5KVmd4TjZRTWdvYXAxN1FRUWlWdm9EU0Y1a2kwbXFkOXNQbkFkRGsweC9JVFZYRzQ4YzlVQjRxaU9IR0ROMm5LT0pGLzB2MFE3OHNjL0hjPSIsICJ0ZXN0bmV0X2FkZHJlc3MiOiAidGIxcTI1YzZmdHE5amVuNGVoaHdkcnFxZzhzd2M2ZHVnOXdrcXdmcHc1In0sICJCb2IiOiB7ImVjZGhfcHVibGljX2tleSI6ICJCS3NOWEdqdG94N1NIR2JlQzdqVGEyeFNrT3ErY01DNjd1N3o4cHdWZGZSWFU2VDZra0Fic2RHWG4zZTVva0VzY3lCMUR3Nmo1UndYRVNZVVZmODFwWkU9IiwgInRlc3RuZXRfYWRkcmVzcyI6ICJ0YjFxejIwcWM0eWxmbnE3dnJxcHdkbWRhcHdqcTV2c213NnFjc21wZW0ifX0"))
