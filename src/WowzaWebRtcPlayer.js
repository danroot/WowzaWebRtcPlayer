
import WowzaWebRTCPlay from "./lib/WowzaWebRTCPlay.js";
export function WowzaWebRtcPlayer(playerElement, errorHandler, connected, stopped) {
  if(typeof playerElement === 'string') playerElement = document.getElementById(playerElement);
  
  this.state = {
    settings: {
      playSdpURL: "",
      playApplicationName: "",
      playStreamName: "",      
    }
  };
  this.statePrefix = "play";

  this.init = (errorHandler, connected, stopped) => {    
    WowzaWebRTCPlay.on({
      onError: errorHandler,
      onStateChanged: state => {
        if (state.connectionState === "connected") {
          connected();
        } else {
          stopped();
        }
      }
    });
    WowzaWebRTCPlay.set({
      videoElementPlay: playerElement
    });
  };

  this.getState = () => {
    return this.state;
  };

  this.start = (url,appName,streamName) => {
    let settings = {playSdpURL:url, playApplicationName:appName, playStreamName:streamName}
    this.update(settings).then(() => {
      WowzaWebRTCPlay.play();
    });
  };

  this.stop = () => {
    WowzaWebRTCPlay.stop();
  };

  this.update = settings => {
    this.state.settings = settings;
    let sendSettings = {};
    for (let key in settings) {
      let sendKey = key.substring(this.statePrefix.length);
      sendKey = sendKey[0].toLowerCase() + sendKey.slice(1);
      sendSettings[sendKey] = settings[key];
    }
    return WowzaWebRTCPlay.set(sendSettings);
  };
  
  this.init(errorHandler||((e)=>{console.log('error',e);}),
            connected||(()=>{console.log('connected');}),
            stopped||(()=>{console.log('stopped');}));
}

