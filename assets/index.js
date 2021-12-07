class Connection {
    constructor(clientId, iosocket, clientType, stream) {
        console.log('~~~New Connection class instance~~~');
        this.iosocket = iosocket;
        this.clientType = clientType;
        this.stream = stream;
        this.peerConn = new RTCPeerConnection();
        this.negotiating = false;
        this.clientId = clientId;
    }

    get haveClient() {
        return !!this.clientId;
    }

    async sendOffer() {
        const offer = await this.peerConn.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: 0,
            voiceActivityDetection: false
        });
        try {
            await this.peerConn.setLocalDescription(offer);
            console.log('Sending -> Offer');
            this.iosocket.emit(`${this.clientType}.msg`, offer);
        } catch (ex) {
            console.warn('Connection.sendOffer()', ex);
        }
    }

    async connect() {
        console.log('connect', this.clientType);
        this.peerConn.addEventListener('iceconnectionstatechange', async () => {
            console.log(`Connection State Changed ${this.peerConn.iceConnectionState}`);

            if (this.peerConn.iceConnectionState === 'connected') {
                document.querySelector('audio').play();
            }
        });

        this.peerConn.addEventListener('negotiationneeded', this.handleNegotiation.bind(this));

        this.peerConn.addEventListener('icecandidate', async ({ type, candidate }) => {
            console.log('Sending -> IceCandidate');
            try {
                await this.peerConn.addIceCandidate(candidate);
                this.iosocket.emit(`${this.clientType}.msg`, { type, candidate });
            } catch (ex) {
                console.warn('Add Local ICE Candidate', ex);
            }
        });

        const messageNamespace = `${(this.clientType === 'client' ? 'host' : 'client')}.msg`;

        this.iosocket.on(messageNamespace, this.handleMessage.bind(this));

        this.peerConn.addEventListener('track', this.handleTrack.bind(this));
    }

    async handleNegotiation() {
        if (this.negotiating) return;
        this.negotiating = true;

        console.log('Negotiation needed');
        await this.sendOffer();
    }

    async handleMessage({ source, type, sdp, candidate }) {
        if (type === 'connection' && this.clientType === 'host' && !this.haveClient) {
            this.clientId = source;
            console.log('New CONNECTION', source);
            await this.sendOffer();
        }

        if (source != this.clientId && this.clientType === 'host') return;

        if (type === 'answer' && sdp) {
            try {
                console.log('Receiving <- Answer');
                await this.peerConn.setRemoteDescription({ type, sdp });
            } catch (ex) {
                console.warn('Error receiving Remote Answer', ex);
            }
        }

        if (type === 'icecandidate' && candidate) {
            console.log('Receiving <- IceCandidate');
            try {
                await this.peerConn.addIceCandidate(candidate);
            } catch (ex) {
                console.warn('Adding remote ICE Candidate', ex);
            }
        }

        if (type === 'offer') {
            console.log('Receiving <- Offer');
            // try {
                await this.peerConn.setRemoteDescription({ type, sdp });
            // } catch (ex) {
            //     console.warn('Error setting Remote Offer', ex);
            // }

            console.log('Sending -> Answer');
            try {
                const answer = await this.peerConn.createAnswer();
                await this.peerConn.setLocalDescription(answer);
                this.iosocket.emit(`${this.clientType}.msg`, answer);
            } catch (ex) {
                console.warn('Setting Local Answer', ex);
            }
        }
    }

    async handleTrack({ streams }) {
        console.log('Got Streams', streams.length);

        const stream = streams[0];
        console.log({ stream });

        console.log('Stream State is', stream.active ? 'active' : 'inactive');

        const tracks = await stream.getTracks();
        console.log('Playing Tracks', tracks.length);

        const audio = document.querySelector('audio');
        audio.addEventListener('loadeddata', () => {
            console.log('loadeddata');
        }, { once: true });
        audio.addEventListener('loadedmetadata', () => {
            console.log('loadedmetadata');
        }, { once: true });
        audio.addEventListener('canplay', () => {
            console.log('canplay');
        }, { once: true });
        audio.controls = true;
        audio.autoplay = true;
        audio.srcObject = stream;
        audio.style.border = '4px solid red';
    }
}

const clients = [];

async function initialise() {
    console.log('initialise');

    let clientType = 'client';
    if (parseSearch(window.location.search).host === 'true') {
        clientType = 'host';
    }

    const iosocket = io();

    iosocket.emit('hello', clientType);
    console.log('I am the', clientType.toUpperCase());

    if (clientType === 'host') {
        /*
        const audio = document.createElement('audio');
        audio.src = 'landdown.mp3';
        audio.loop = true;
        await audio.play();
        const stream = await audio.captureStream();
        */
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log({ stream });

        iosocket.on('client.msg', async ({ source, type }) => {
            if (type === 'connection' && clientType === 'host') {
                const conn = new Connection(null, iosocket, clientType, stream);
                await conn.connect();
                conn.handleTrack({ streams: [ stream ] });
            }
        });

        const conn = new Connection(null, iosocket, clientType, stream);
        await conn.connect();
        conn.handleTrack({ streams: [ stream ] });

        clients.push(conn);
    } else {
        try {
            const conn = new Connection(null, iosocket, clientType, null);
            await conn.connect();

            clients.push(conn);
        } catch (ex) {
            console.warn('Client Connection Error', ex);
        }
    }
}

const btnConnect = document.querySelector('.connect');
btnConnect.onclick = () => initialise();

const btnReload = document.querySelector('.reload');
btnReload.onclick = () => window.location.reload();

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