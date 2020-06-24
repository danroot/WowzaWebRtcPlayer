var WowzaRtc = (function (exports) {
  'use strict';

  /*
   * This code and all components (c) Copyright 2019-2020, Wowza Media Systems, LLC. All rights reserved.
   * This code is licensed pursuant to the BSD 3-Clause License.
   */


  const browserDetails = window.adapter.browserDetails;

  function mungeSDPPlay(sdpStr) {

    // For greatest playback compatibility, 
    // force H.264 playback to baseline (42e01f).

    let sdpLines = sdpStr.split(/\r\n/);
    let sdpStrRet = '';

    for (var sdpIndex in sdpLines) {
      var sdpLine = sdpLines[sdpIndex];

      if (sdpLine.length == 0)
        continue;

      if (sdpLine.includes("profile-level-id")) {
        // The profile-level-id string has three parts: XXYYZZ, where
        //   XX: 42 baseline, 4D main, 64 high
        //   YY: constraint
        //   ZZ: level ID
        // Look for codecs higher than baseline and force downward.
        let profileLevelId = sdpLine.substr(sdpLine.indexOf("profile-level-id")+17,6);
        let profile = Number('0x'+profileLevelId.substr(0,2));
        let constraint = Number('0x'+profileLevelId.substr(2,2));
        let level = Number('0x'+profileLevelId.substr(4,2));
        if (profile > 0x42)
        {
          profile = 0x42;
          constraint = 0xE0;
          level = 0x1F;
        }
        let newProfileLevelId = ("00" + profile.toString(16)).slice(-2).toLowerCase() +
          ("00" + constraint.toString(16)).slice(-2).toLowerCase() +
          ("00" + level.toString(16)).slice(-2).toLowerCase();

        sdpLine = sdpLine.replace(profileLevelId,newProfileLevelId);
      }

      sdpStrRet += sdpLine;
      sdpStrRet += '\r\n';
    }

    return sdpStrRet;  
  }

  /*
   * This code and all components (c) Copyright 2019-2020, Wowza Media Systems, LLC. All rights reserved.
   * This code is licensed pursuant to the BSD 3-Clause License.
   */

  class WowzaPeerConnectionPlay
  {
    constructor (props)
    {
      // munge plug-in
      this.mungeSDP = undefined;

      // callbacks
      this.onconnectionstatechange = undefined;
      this.onstop = undefined;
      this.onerror = undefined;

      // local state
      this.videoElement = undefined;
      this.sdpURL = '';

      this.repeaterRetryCount = 0;

      this.streamInfo = undefined;
      this.userData = undefined;

      this.wsConnection = undefined;
      this.peerConnection = undefined;
      this.peerConnectionConfig = { 'iceServers': [] }; // is this used?

      this.gotIceCandidate = this.gotIceCandidate.bind(this);
      this.gotDescription = this.gotDescription.bind(this);
      this.gotRemoteTrack = this.gotRemoteTrack.bind(this);

      this.doGetAvailableStreams = false;
      this.getAvailableStreamsResolve = undefined;
      this.getAvailableStreamsReject = undefined;

      if (props) {
        this.set(props);
      }
    }

    // set props:
    //   sdpURL: string
    //   videoElement: <video>
    //   streamInfo: { applicationName, streamName }
    //   userData: any
    //   mungeSDP: function (sdpStr)
    //   onconnectionstatechange: function
    //   onerror: function 
    set (props) 
    {
      if (props.sdpURL != null)
        this.sdpURL = props.sdpURL;
      if (props.videoElement != null)
        this.videoElement = props.videoElement;
    
      if (props.streamInfo != null)
        this.streamInfo = props.streamInfo;
      if (props.userData != null)
        this.userData = props.userData;
    
      if (props.mungeSDP != null)
        this.mungeSDP = props.mungeSDP;
    
      if (props.onconnectionstatechange != null)
        this.onconnectionstatechange = props.onconnectionstatechange;
      if (props.onstop != null)
        this.onstop = props.onstop;
      if (props.onerror != null)
        this.onerror = props.onerror;
    }

    gotIceCandidate (event) 
    {
      if (event.candidate != null) ;
    }

    gotDescription (description) 
    {
      let _this = this;
      console.log('WowzaPeerConnectionPlay.gotDescription');

      this.peerConnection
        .setLocalDescription(description)
        .then(() => {
          console.log('sendAnswer');
          _this.wsConnection.send('{"direction":"play", "command":"sendResponse", "streamInfo":' + JSON.stringify(_this.streamInfo) + ', "sdp":' + JSON.stringify(description) + ', "userData":' + JSON.stringify(_this.userData) + '}');
        })
        .catch(err => console.log('set description error', err));
    }

    gotRemoteTrack (event) 
    {
      console.log('WowzaPeerConnectionPlay.gotRemoteTrack: kind:' + event.track.kind + ' stream:' + event.streams[0]);
      try {
        this.videoElement.srcObject = event.streams[0];
      } catch (error) {
        this.videoElement.src = window.URL.createObjectURL(event.streams[0]);
      }
    }

    wsConnect(url) 
    {
      let _this = this;
      console.log('WowzaPeerConnectionPlaywsConnect: ' + url);

      try {
        this.wsConnection = new WebSocket(url);
      }
      catch (e) {
        this.errorHandler(e);
        return;
      }
      this.wsConnection.binaryType = 'arraybuffer';

      this.wsConnection.onopen = function () 
      {
        console.log("WowzaPeerConnectionPlay.onopen");

        _this.peerConnection = new RTCPeerConnection(_this.peerConnectionConfig);

        _this.peerConnection.onicecandidate = _this.gotIceCandidate;

        _this.peerConnection.ontrack = _this.gotRemoteTrack;

        _this.peerConnection.onconnectionstatechange = (event) => {
          if (_this.onconnectionstatechange != null)
          {
            _this.onconnectionstatechange(event);
          }
        };

        if (_this.doGetAvailableStreams) {
          sendPlayGetAvailableStreams();
        }
        else {
          sendPlayGetOffer();
        }
      };

      function sendPlayGetOffer () {
        console.log("sendPlayGetOffer: " + JSON.stringify(_this.streamInfo));
        _this.wsConnection.send('{"direction":"play", "command":"getOffer", "streamInfo":' + JSON.stringify(_this.streamInfo) + ', "userData":' + JSON.stringify(_this.userData) + '}');
      }

      function sendPlayGetAvailableStreams() {
        console.log("sendPlayGetAvailableStreams: " + JSON.stringify(_this.streamInfo));
        _this.wsConnection.send('{"direction":"play", "command":"getAvailableStreams", "streamInfo":' + JSON.stringify(_this.streamInfo) + ', "userData":' + JSON.stringify(_this.userData) + '}');
      }

      this.wsConnection.onmessage = function (evt) 
      {
        console.log("wsConnection.onmessage: " + evt.data);

        let msgJSON = JSON.parse(evt.data);

        let msgStatus = Number(msgJSON['status']);
        let msgCommand = msgJSON['command'];

        if (msgStatus == 514) // repeater stream not ready
        {
          _this.repeaterRetryCount++;
          if (_this.repeaterRetryCount < 10) {
            setTimeout(sendPlayGetOffer, 500);
          }
          else {
            _this.errorHandler({message:'Live stream repeater timeout: ' + streamName});
            _this.stop();
          }
        }
        else if (msgStatus != 200) {
          _this.errorHandler({message:msgJSON['statusDescription']});
          _stop();
        }
        else {

          let streamInfoResponse = msgJSON['streamInfo'];
          if (streamInfoResponse !== undefined) {
            _this.streamInfo.sessionId = streamInfoResponse.sessionId;
          }

          let sdpData = msgJSON['sdp'];
          if (sdpData != null) {
            console.log('sdp: ' + JSON.stringify(msgJSON['sdp']));

            if (_this.mungeSDP != null)
            {
              msgJSON.sdp.sdp = _this.mungeSDP(msgJSON.sdp.sdp);
            }

            // Enhance here if Safari is a published stream.
            console.log("SDP Data: " + msgJSON.sdp.sdp);

            _this.peerConnection
              .setRemoteDescription(new RTCSessionDescription(msgJSON.sdp))
              .then(() => _this.peerConnection
                .createAnswer()
                .then((description) => _this.gotDescription(description))
                .catch((err) => _this.errorHandler(err))
              )
              .catch((err) => _this.errorHandler(err));
          }

          let iceCandidates = msgJSON['iceCandidates'];
          if (iceCandidates != null) {
            for (let index in iceCandidates) {
              console.log('iceCandidates: ' + JSON.stringify(iceCandidates[index]));
              _this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidates[index]));
            }
          }
        }

        if ('sendResponse'.localeCompare(msgCommand) == 0) {
          if (_this.wsConnection != null) {
            _this.wsConnection.close();
          }
            
          _this.wsConnection = null;
        }
        // now check for getAvailableResponse command to close the connection 
        if ('getAvailableStreams'.localeCompare(msgCommand) == 0) {
          _this.stop();
          _this.getAvailableStreamsResolve(msgJSON);
        }
      };

      this.wsConnection.onclose = function () {
        console.log("wsConnection.onclose");
      };

      this.wsConnection.onerror = function (evt) {
        _this.errorHandler(evt);
      };
    }

    start ()
    {
      this.repeaterRetryCount = 0;
      this.doGetAvailableStreams = false;

      if (this.peerConnection == null) {
        console.log("WowzaPeerConnectionPlay.start: sdpURL:" + this.sdpURL + " streamInfo:" + JSON.stringify(this.streamInfo));
        this.wsConnect(this.sdpURL);
      }
      else {
        console.log('WowzaPeerConnectionPlay.start: peerConnection already in use, not starting');
      }
    }

    stop ()
    {
      if (this.peerConnection != null) {
        this.peerConnection.close();
      }
      
      this.peerConnection = null;

      if (this.wsConnection != null) {
        this.wsConnection.close();
      }
      this.wsConnection = null;

      this.videoElement.src = "";

      if (this.onstop != null) {
        this.onstop();
      }
    }

    getAvailableStreams ()
    {
      let _this = this;
      return new Promise((resolve,reject) => {
        _this.getAvailableStreamsResolve = resolve;
        _this.getAvailableStreamsReject = reject;
        _this.doGetAvailableStreams = true;

        if (_this.peerConnection == null) {
          _this.wsConnect(_this.sdpURL);
        }
        else {
          reject({message:"WowzaPeerConnectionPlay.getAvailableStreams: peerConnection already in use"});
        }
      });
    }

    errorHandler (error)
    {
      if (this.onerror != null) {
        this.onerror(error);
      }
    }
  }

  /*
   * This code and all components (c) Copyright 2019-2020, Wowza Media Systems, LLC. All rights reserved.
   * This code is licensed pursuant to the BSD 3-Clause License.
   */

  let state = {
    connectionState:'stopped',
    videoElementPlay:undefined,
    sdpURL:'',
    streamInfo:{
      applicationName: "",
      streamName: "",
      sessionId: "[empty]"
    },
    userData: { param1: "value1" } // ?
  };
  let wowzaPeerConnectionPlay = undefined;
  let callbacks = {}; // TODO: turn into listeners

  const setState = (newState) =>
  {
    return new Promise((resolve,reject) => {
      state = {...state,...newState};
      if (callbacks.onStateChanged != null)
      {
        callbacks.onStateChanged(state);
      }
      resolve(state);
    });
  };

  const getState = () =>
  {
    return state;
  };

  // Private callbacks for the peerConnection
  const onconnectionstatechange = (evt) =>
  {
    if (evt.target != null && evt.target.connectionState != null)
    {
      setState({connectionState:evt.target.connectionState});
    }
  };

  const onstop = () =>
  {
    setState({connectionState:'stopped'});
  };


  // External wire callbacks
  const on = (_callbacks) => {
    callbacks = _callbacks;
  };

  // External set
  const set = (props) => {
    return new Promise((resolve,reject) => {
    
      let currentState = getState();
      let newStreamInfo = {...currentState.streamInfo};
      let newState = {};
    
      if (props.videoElementPlay != null)
        newState['videoElementPlay'] = props.videoElementPlay;

      if (props.sdpURL != null)
        newState['sdpURL'] = props.sdpURL.trim();

      if (props.applicationName != null)
        newStreamInfo['applicationName'] = props.applicationName.trim();
      if (props.streamName != null)
        newStreamInfo['streamName'] = props.streamName.trim();
      if (props.sessionId != null)
        newStreamInfo['sessionId'] = props.sessionId;
      if (props.streamInfo != null)
        newStreamInfo = {...newStreamInfo,...props.streamInfo};

      newState['streamInfo'] = newStreamInfo;

      if (props.userData != null)
        newState['userData'] = {...props.userData};

      setState(newState)
      .then((s) => {
        resolve(s);
      });
    });
  };

  const getAvailableStreams = () =>
  {
    let currentState = getState();
    wowzaPeerConnectionPlay = new WowzaPeerConnectionPlay({
      sdpURL:currentState.sdpURL,
      videoElement:currentState.videoElementPlay,
      streamInfo:currentState.streamInfo,
      userData:currentState.userData,
      mungeSDP:mungeSDPPlay,
      onconnectionstatechange: onconnectionstatechange,
      onstop:onstop,
      onerror:errorHandler
    });
    return (wowzaPeerConnectionPlay.getAvailableStreams());
  };

  const play = () =>
  {
    let currentState = getState();
    wowzaPeerConnectionPlay = new WowzaPeerConnectionPlay({
      sdpURL:currentState.sdpURL,
      videoElement:currentState.videoElementPlay,
      streamInfo:currentState.streamInfo,
      userData:currentState.userData,
      mungeSDP:mungeSDPPlay,
      onconnectionstatechange: onconnectionstatechange,
      onstop:onstop,
      onerror:errorHandler
    });
    wowzaPeerConnectionPlay.start();
  };

  const stop = () => 
  {
    wowzaPeerConnectionPlay.stop();
    wowzaPeerConnectionPlay = undefined;
  };

  const errorHandler = (error) =>
  {
    console.log('WowzaWebRTCPlay ERROR:');
    console.log(error);
    if (error.message == null)
    {
      if (error.target != null)
      {
        console.log('typeof error.target: ' + typeof error.target);
      }
    }
    if (callbacks.onError != null)
    {
      callbacks.onError(error);
    }
  };

  let WowzaWebRTCPlay = {
    on: on,
    set: set,
    getState: getState,
    getAvailableStreams: getAvailableStreams,
    play: play,
    stop: stop
  };

  function WowzaWebRtcPlayer(playerElement, errorHandler, connected, stopped) {
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
      let settings = {playSdpURL:url, playApplicationName:appName, playStreamName:streamName};
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

  exports.WowzaWebRtcPlayer = WowzaWebRtcPlayer;

  return exports;

}({}));
