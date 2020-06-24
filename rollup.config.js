export default {
    input: 'src/WowzaWebRtcPlayer.js',
    output: [{
        file: 'dist/WowzaWebRtcPlayer.browser.js',
        format: 'iife',
        name: 'WowzaRtc'
    },
    {
        file: 'dist/WowzaWebRtcPlayer.esm.js',
        format: 'es',
        name: 'WowzaRtc'
    }
    ]
};