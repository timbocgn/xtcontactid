// -------------------------------------------------------------------------------
// CONTACT_ID Server for Lupus XT1
//
// The purpose is simple: enter the server URL to the contact_id field in the XT1
// menu and it will inform this server here about all events
//
// The current use is to activate / deactivate the home mode in the Synaptics
// surveillance station using two custom events defined in "Actions". It also 
// sends some messages via PushOver API to recipients.
// It also will send a message to your MQTT server you could use to provide some 
// timebased metrics about the status changes.
//
// Inspired by https://github.com/schmupu/ioBroker.contactid/
// Fletcher Sum ported to JS: https://alarmforum.de/archive/index.php/thread-12037.html
//
// Copyright (c) 2019 Tim Hagemann / way2.net Services
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// -------------------------------------------------------------------------------

// --- some packages we need

var net = require('net');
var buffer = require('buffer');
var http = require('http');
var Push = require( 'pushover-notifications' )
var mqtt = require('mqtt')

// --- load contact id strings

const contactid_strings = require('./contactid.json')

// --- some constants you might need to change. Add them to your xtcontactid-config.js file

// const PORT 				= 1234;	
// const ACTIVATE_HOME 		= "http://<your_synology_name>:5000/webapi/entry.cgi?api=SYNO.SurveillanceStation.ExternalEvent&method=\"Trigger\"&version=1&eventId=1&eventName=\"Activate\"&account=\"<user>\"&password=\"<pass>\""
// const DEACTIVATE_HOME 	= "http://<your_synology_name>:5000/webapi/entry.cgi?api=SYNO.SurveillanceStation.ExternalEvent&method=\"Trigger\"&version=1&eventId=2&eventName=\"Deactivate\"&account=\"<user>\"&password=\"<pass>\""
// const PUSHOVER_USER		= "<your user>"
// const PUSHOVER_TOKEN		= "<your token>"
// const MQTT_SERVER 		= "mqtt://<your_mqtt_server>"
// const MQTT_TOPIC_STATUS 	= "<base topic>/xt1/status"
// const MQTT_TOPIC_PING 	= "<base topic>/xt1/ping"

require('./xtcontactid-config.js')

// -------------------------------------------------------------------------------

function LogNormal(str)
{
	console.log(str);
}

// -------------------------------------------------------------------------------

function LogErr(str)
{
	console.error(str);
}

// -------------------------------------------------------------------------------
//
// Send a https command to a REST server. JSON result expected
//
// -------------------------------------------------------------------------------

function SendCommand(cmd)
{

	http.get(cmd, (resp) => {

		// --- called on connect 
		  
  		let data = '';

		// --- called when data arrives 

		resp.on('data', (chunk) => {
    		data += chunk;
  		});
  		
  		// --- whole response 

		resp.on('end', () => {
		
			var response = JSON.parse(data);
			if (!response["success"])
			{
				LogErr("Failed send command");
			}
  		});

	}).on("error", (err) => {
  		LogErr("Error while sending command: " + err.message);
	});

}

// -------------------------------------------------------------------------------
//
// Send a message to PushOver
//
// IN:  e: false -> normal message, true -> high prio
//		t: Title (string)
//		m: Message (string)
//
// -------------------------------------------------------------------------------

function SendMessage(e,t,m) {

	// --- construct the message
	
	var msg;
	var d = new Date;
	
	if (e) {
		msg = {
  				message: m,	
  				title: t,
  				//sound: 'magic',
  				priority: 2,
  				retry: 30,
  				expire: 36000
			}
	}
	else {
		msg = {
  				message: m,	
  				title: t,
  				//sound: 'magic',
  				priority: 0
			}	
	}
	
	// --- send the message	
	
	var p = new Push( {
  						user: PUSHOVER_USER,
  						token: PUSHOVER_TOKEN,
  						update_sounds: true 
					})
					
	p.send( msg, function( err, result ) {
  		if ( err ) {
  			LogErr("Error while sending command: " + err.message);
  		}
	})

}

// -------------------------------------------------------------------------------
//
// IN:  Buffer object with the message (except [] and checksum)
// OUT: The checksum as integer
//
// JS port from https://alarmforum.de/archive/index.php/thread-12037.html
//
// -------------------------------------------------------------------------------

function fletcher_sum(buf)  {

	sum1 = 0x0;
	sum2 = 0x0;
	
	len = buf.length;
	idx = 0;
	
	while (len) {
		tlen = 0;
		
		if (len > 256)
			{ tlen = 256; }
		else
			{ tlen = len; }
		
		len -= tlen;
		
		do {
			sum1 += buf[idx];
			sum1 = (sum1 & 0xff);
			sum2 += sum1;
			sum2 = (sum2 & 0xff);
			
			idx++;
			
		} while (--tlen);
	}
	return sum2 << 8 | sum1;

}

// -----------------------------------------------------------------------------------
//
// IN:  The full contact id telegram
// OUT: hashtable with the decoded information
// 
// Adapted from https://github.com/schmupu/ioBroker.contactid/blob/master/contactid.js
// -----------------------------------------------------------------------------------

function parseCID(data) {

	let cid = null
	
	// ---  check the checksum first. Use regexp to remove [] and checksum from message
	
	let reg2 = /^\[(.*)(.{4})(.*)\]/gm;
  	let match2 = reg2.exec(data);

	if (match2)
	{
	    var message_cs 	= parseInt(match2[2], 16); 
		var expected_cs = fletcher_sum(Buffer.from(match2[1]))
		
		if (message_cs == expected_cs)
		{
			// ---  checksums are ok. try to decode 
			
  			let reg = /^\[(.+) 18(.)(.{3})(.{2})(.{3})(.*)\]/gm;
  			let match = reg.exec(data);

  			if (match) {
    
			    cid = {
      				  	  subscriber: match[1].trim()
      					, qualifier: match[2]
      					, event: match[3]
      					, group: match[4]
      					, sensor: match[5]
      					, checksum: match[6]
    				};
    		}
			else
			{
				LogErr("Received malformed message " + data + ". Error during data extraction.")
			}
		}
		else
		{
			LogErr("Received malformed message " + data + ". Checksums do not match. Expected " + expected_cs.toString(16));
		}
	}
	else
	{
		LogErr("Received malformed message " + data + ". Error during checksum extraction.")
	}

    return cid;
}

// -----------------------------------------------------------------------------------
//
// Open / Close Event
//
// -----------------------------------------------------------------------------------

function AlarmCondition(cid)
{
	// --- test message: [test 18313100003D504]
	
	var e = cid["event"];
	var s = "ALARM condition detected: " + e + " -> " + contactid_strings[e].Event + " (" + contactid_strings[e].Description + ")"
	
	// --- do some logging 
	
	LogNormal(s)
	
	// --- and send the message
	
	SendMessage(true,"Lupus XT1",s);
	
	// --- mqtt send

	mqtt_client.publish(MQTT_TOPIC_STATUS,'{ "status": 99 }');
}

// -----------------------------------------------------------------------------------
//
// Open / Close Event
//
// -----------------------------------------------------------------------------------

function OpenClose(ev)
{
	// Disarm: 1 / Arm: 3
	LogNormal("Open / Close event detected: " + ev)
	
	if (ev == "1")
	{
		LogNormal("disarm")
		SendMessage(false,"Lupus XT1","The alarm has been DISARMed");
		SendCommand(ACTIVATE_HOME);

		mqtt_client.publish(MQTT_TOPIC_STATUS,'{ "status": 50 }');
	}
	else
	{
		LogNormal("arm")
		SendMessage(false,"Lupus XT1","The alarm has been ARMed");
		SendCommand(DEACTIVATE_HOME);

		mqtt_client.publish(MQTT_TOPIC_STATUS,'{ "status": 10 }');

	}
}

// -----------------------------------------------------------------------------------
//
// Action Dispatcher 
//
// -----------------------------------------------------------------------------------

function action(cid)
{
	LogNormal("Decoded Message: " + JSON.stringify(cid))
	
	// --- arm / disarm events
		
	if ((cid["event"] == "400") || 
		(cid["event"] == "401") ||
		(cid["event"] == "402") ||
		(cid["event"] == "403") ||	
		(cid["event"] == "404") ||
		(cid["event"] == "407") ||
		(cid["event"] == "409"))
		{
			OpenClose(cid["qualifier"]);
		}

	// --- alarm events

	if ((cid["event"] == "101") || 
		(cid["event"] == "110") ||
		(cid["event"] == "111") ||
		(cid["event"] == "112") ||	
		(cid["event"] == "113") ||
		(cid["event"] == "114") ||
		(cid["event"] == "117") ||
		(cid["event"] == "120") ||
		(cid["event"] == "122") ||
		(cid["event"] == "123") ||
		(cid["event"] == "129") ||
		(cid["event"] == "130") ||
		(cid["event"] == "131") ||
		(cid["event"] == "132") ||
		(cid["event"] == "133") ||
		(cid["event"] == "134") ||
		(cid["event"] == "136") ||
		(cid["event"] == "137") ||
		(cid["event"] == "139") ||
		(cid["event"] == "140") ||
		(cid["event"] == "141") ||
		(cid["event"] == "142") ||
		(cid["event"] == "144") ||
		(cid["event"] == "145") ||
		(cid["event"] == "146") ||
		(cid["event"] == "147") ||
		(cid["event"] == "150"))
		{
			AlarmCondition(cid);
		}
		
	// --- periodic test report
		
	if ((cid["event"] == "601") || 
		(cid["event"] == "602"))
		{
			LogNormal("Periodic or manual test report")

			SendMessage(false,"Lupus XT1","Periodic or manual test report");

			mqtt_client.publish(MQTT_TOPIC_PING,'{ "ping": 1 }');
		}
}

// -----------------------------------------------------------------------------------
//
// Main Program 
//
// -----------------------------------------------------------------------------------

// --- create a server object

LogNormal("");
LogNormal("---- Server staring up ----");
LogNormal("");

SendMessage(false,"Lupus XT1","Server starting up...")

var server = net.createServer(function(socket) {

	// --- this is the lambda function which gets called on connect
	
	LogNormal("Connect from:" + socket.remoteAddress)
	
	// --- in case of an error, just print it
	
	socket.on('error', function(err) {
   		console.error(err)
	})

	//--- this is the callback for arriving data
		
	socket.on('data', function(data) {
		
		// --- log the datagram
		
		var textChunk = data.toString('utf8');
		LogNormal("Got datagram: " + textChunk);
		
		// --- parse and run the action function on it
		
		var cid = parseCID(data);
		
		if (cid) { action(cid); }

		// --- send the XT1 acknowledge 
				
		var ack = Buffer.from([6]);
		socket.write(ack);
	});

});

// --- connect to MQTT

mqtt_client  = mqtt.connect(MQTT_SERVER);

// --- and listen on the respective PORT

server.listen(PORT);

