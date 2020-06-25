# Wowza Web Rtc Player

This code provides a simple WebRTC player based on the code provided by https://github.com/WowzaMediaSystems/webrtc-examples.

## Usage

```javascript
    <video id="player" autoplay playsinline muted controls>
    </video>
    <script type="text/javascript" src="//webrtchacks.github.io/adapter/adapter-latest.js"></script>
    <script src="//unpkg.com/wowzartcplayerjs@1.0.3/dist/WowzaWebRtcPlayer.browser.js"></script>
    <script>      
        (function () {
            var player = new WowzaRtc.WowzaWebRtcPlayer('player');
            player.start('wss://someserver:443/webrtc-session.json','someapplication','some.stream');
        })();
    </script>
```