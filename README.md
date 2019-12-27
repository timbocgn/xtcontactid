# XTContactID

This node.js App starts a contact ID server to be used by a Lupus XT1 alarm panel. It has been tested with the first version (aka XT1) of the Lupus alarm panel.

## Getting Started

### Prerequisites

You should install NPM on your machine, NAS or device your want to use as the contact ID server.

### Installing and Compiling

Download or clone the repository to your system:

```
https://github.com/timbocgn/xtcontactid.git
```

Firstly you should install all the dependencies for application:

```
npm install
```

Now you will have to provide a config file `xtcontactid-config.js`:

```

const PORT 				= 1234;	
const ACTIVATE_HOME 		= "http://<your_synology_name>:5000/webapi/entry.cgi?api=SYNO.SurveillanceStation.ExternalEvent&method=\"Trigger\"&version=1&eventId=1&eventName=\"Activate\"&account=\"<user>\"&password=\"<pass>\""
const DEACTIVATE_HOME 	= "http://<your_synology_name>:5000/webapi/entry.cgi?api=SYNO.SurveillanceStation.ExternalEvent&method=\"Trigger\"&version=1&eventId=2&eventName=\"Deactivate\"&account=\"<user>\"&password=\"<pass>\""
const PUSHOVER_USER		= "<your user>"
const PUSHOVER_TOKEN		= "<your token>"
const MQTT_SERVER 		= "mqtt://<your_mqtt_server>"
const MQTT_TOPIC_STATUS 	= "<base topic>/xt1/status"
const MQTT_TOPIC_PING 	= "<base topic>/xt1/ping"
```

When this is done, you can start the server manually by:

```
npm xtcontactid.js
```
or use the provides `xtcontactid.conf` config file for upstart based linux systems (such as my Synology NAS device). Copy it to `/etc/init`, restart upstart with `initctl reload-configuration` followed by a `initctl start xtconfigid`.

## How to use

### Pushover

Just provide the user and token to the respective configuration variables. The alarm event will be send with a high priority and has to be acknowledged by all clients.

### Lupus XT1 configuration

* go to "Einstellungen"
* select "Contact ID" tab
* provide the URL of your server to URL 1 field in the following form `rptn://test@<ip>:<port>`

If you provide some setting in "Automatische Anmeldebenachrichtigung", you will receive the regular ping messages in the `MQTT_TOPIC_PING` topic.

### Synology NAS configuration

I use this to disable the video recording of the Synology surveillance station by switching it to "home" mode and enabling the camera recording only in "non home" periods.

Serveral steps are required to configure this:

* go to your Surveillance screen 
* go to Action Rules using the main menu
* create a rule "Enter Home Mode" with Rule Type "Triggered" 
* go to the "Event" tab, add one event and select Event source = External device, Event = "External Event 1"
* press the "Get Command" button and copy this URL to a save place
* go to the Action Tab, add one action, and select Action Device = Surveilance Station and Action = Enter Home Mode
* create a second rule "Leave Home Mode" with Rule Type "Triggered" 
* go to the "Event" tab, add one event and select Event source = External device, Event = "External Event 2"
* press the "Get Command" button and copy this URL to a save place
* go to the Action Tab, add one action, and select Action Device = Surveilance Station and Action = Leave Home Mode

The saved URLs have to be added to the `ACTIVATE_HOME` and `DEACTIVATE_HOME` settings respectively. It is a good idea to test these URL and the password on the commandline (e.g. with curl or wget)


* go to your Surveillance screen and select the "Home Mode" icon in the main menu
* switch to Recording and *delete* all recording entries in the schedule grid. This means in home mode, nothing will be recorded.

### Push the status to MQTT

The server pushes JSON messages to your MQTT server

For the armed status:

```
{ "status": 10 }
```

For disarmed:

```
{ "status": 50 }
```

For alarm:

```
{ "status": 99 }
```

to the `MQTT_TOPIC_STATUS` topic.

If you have configured the regular "keep alive pings" in your Lupus device, the server will push 

```
{ "ping": 1 }
```

to the `MQTT_TOPIC_PING`.

This format it easy to read for a telegraf / influxdb / grafana setup from your MQTT server ;-).

## Authors

* **Tim Hagemann** - *Initial work* - https://github.com/timbocgn

## License

This project is licensed under the MIT License.

## Acknowledgments

* https://github.com/schmupu/ioBroker.contactid/ for the initial contact id protocol code
* https://alarmforum.de/archive/index.php/thread-12037.html for the fletcher sum algorithm for sending the "ACKs" to the xt1