async function initialise() {
    console.log('initialise');

    let clientType = 'client';
    if (parseSearch(window.location.search).host === 'true') {
        clientType = 'host';
    }

    const iosocket = io();

    iosocket.emit('hello', clientType);
    console.log('I am the', clientType.toUpperCase());

    const peerConn = new RTCPeerConnection();

    const sendOffer = async () => {
        const offer = await peerConn.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: 0,
            voiceActivityDetection: false
        });
        await peerConn.setLocalDescription(offer);
        console.log('Sending -> Offer');
        iosocket.emit(`${clientType}.msg`, offer);
    }

    peerConn.addEventListener('iceconnectionstatechange', () => {
        console.log(`Connection State Changed ${peerConn.iceConnectionState}`);
    });

    peerConn.addEventListener('icecandidate', async ({ type, candidate }) => {
        console.log('Sending -> IceCandidate');
        iosocket.emit(`${clientType}.msg`, { type, candidate });
        await peerConn.addIceCandidate(candidate);
    });

    if (clientType === 'host') {
        sendOffer();
    }

    iosocket.on(`${(clientType === 'client' ? 'host' : 'client')}.msg`, async ({ type, sdp, candidate }) => {
        console.log({ clientType, type });
        if (type === 'connection' && clientType === 'host') {
            sendOffer();
        }

        if (type === 'answer' && sdp) {
            console.log('Receiving <- Answer');
            await peerConn.setRemoteDescription({ type, sdp });
        }

        if (type === 'icecandidate' && candidate) {
            console.log('Receiving <- IceCandidate');
            await peerConn.addIceCandidate(candidate);
        }

        if (type === 'offer') {
            console.log('Receiving <- Offer');
            await peerConn.setRemoteDescription({ type, sdp });

            console.log('Sending -> Answer');
            const answer = await peerConn.createAnswer();
            await peerConn.setLocalDescription(answer);
            iosocket.emit(`${clientType}.msg`, answer);
        }
    });

    if (clientType === 'host') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // const audio = document.createElement('audio');
        // audio.src = 'landdown.mp3';
        // audio.loop = true;
        // audio.controls = true;
        // document.body.appendChild(audio);

        // audio.addEventListener('playing', async () => {
        //     const stream = await audio.captureStream();
        // }, { once: true });
        const tracks = await stream.getTracks();

        console.log('adding tracks', tracks.length);
        tracks.forEach(track => peerConn.addTrack(track, stream));

        // audio.play();
    }

    if (clientType === 'client') {
        peerConn.addEventListener('track', ({ streams }) => {
            console.log('Got Track', streams);
            const stream = streams[0];

            const audio = document.querySelector('audio');
            audio.addEventListener('loadeddata', () => {
                console.log('loadeddata');
                audio.play();
            });
            audio.addEventListener('loadedmetadata', () => {
                console.log('loadedmetadata');
            });
            audio.addEventListener('canplay', () => {
                console.log('canplay');
            });
            audio.controls = true;
            audio.autoplay = true;
            audio.srcObject = stream;
            audio.style.border = '4px solid red';
        });
    }
}

const button = document.createElement('button');
button.textContent = 'Connect';

button.onclick = () => initialise();

document.body.appendChild(button);

function parseSearch(search) {
    return search
        .slice(1)
        .split('&')
        .map(p => p.split('='))
        .map(([k, v]) => ({[k]: v}))
        .reduce((a, v) => {
            return {...a, ...v};
        }, {})
}