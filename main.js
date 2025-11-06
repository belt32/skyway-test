const {
  nowInSec,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  uuidV4,
} = skyway_room;

(async () => {
  const joinBtn = document.getElementById("join");
  const roomNameInput = document.getElementById("room-name");
  const appIdInput = document.getElementById("app-id");
  const secretInput = document.getElementById("secret-key");

  const localVideo = document.getElementById("local-video");
  const remoteArea = document.getElementById("remote-media-area");

  // ✅ ローカルカメラ取得
  const { video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
  video.attach(localVideo);
  await localVideo.play();

  joinBtn.onclick = async () => {
    const appId = appIdInput.value;
    const secret = secretInput.value;
    const roomName = roomNameInput.value;

    if (!appId || !secret || !roomName) {
      alert("App ID / Secret Key / Room Name をすべて入力してください");
      return;
    }

    console.log("🔑 Generating token...");

    // ✅ 入力されたキーからTokenを生成（GitHubに保存しない安全方式）
    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      version: 3,
      scope: {
        appId,
        rooms: [
          {
            name: "*",
            methods: ["create", "close"],
            member: { name: "*", methods: ["publish", "subscribe"] },
          },
        ],
      },
    }).encode(secret);

    console.log("✅ Token created");

    console.log("🔌 Connecting...");

    const context = await SkyWayContext.Create(token, {
      iceConfig: { iceTransportPolicy: "relay" },
    });

    const room = await SkyWayRoom.FindOrCreate(context, { name: roomName });
    const me = await room.join();

    console.log("✅ Joined:", me.id);

    // ✅ Publish（自分のカメラ送信）
    await me.publish(video, { type: "sfu" });
    console.log("✅ Video published");

    // ✅ 他人の映像が来た時
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      console.log("📡 Incoming stream:", e.publication.id);

      const { stream } = await me.subscribe(e.publication);

      if (stream.track.kind === "video") {
        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.playsInline = true;
        stream.attach(vid);
        remoteArea.appendChild(vid);
        console.log("✅ Remote video attached");
      }
    });
  };
})();
