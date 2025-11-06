// --- SkyWay SDK の取り出し ---
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

  const localVideo = document.getElementById("local-video"); // プレビュー用（ある場合）
  const remoteArea = document.getElementById("remote-media-area");

  // カメラ取得（失敗しても受信専用で動作）
  let video = null;
  try {
    const result = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
    video = result.video;
    video.attach(localVideo);
    await localVideo.play();
    console.log("✅ Camera available, local preview started");
  } catch (err) {
    console.warn("⚠️ Camera not available, running as receive-only");
  }

  joinBtn.onclick = async () => {
    const appId = appIdInput.value.trim();
    const secret = secretInput.value.trim();
    const roomName = roomNameInput.value.trim();

    if (!appId || !secret || !roomName) {
      alert("App ID / Secret Key / Room Name をすべて入力してください");
      return;
    }

    console.log("🔑 Generating token...");
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

    // カメラがある場合のみ Publish
    if (video) {
      await me.publish(video, { type: "sfu" });
      console.log("✅ Video published");
    }

    // 他の参加者の映像受信
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      console.log("📡 Incoming stream:", e.publication.id);
      const { stream } = await me.subscribe(e.publication);

      if (stream.track.kind === "video") {
        const vid = document.createElement("video");
        vid.id = `media-${e.publication.id}`;
        vid.autoplay = true;
        vid.playsInline = true;
        stream.attach(vid);
        remoteArea.appendChild(vid);
        console.log("✅ Remote video attached");
      }
    });

    // 退出時に映像を削除
    room.onStreamUnpublished.add((e) => {
      const vid = document.getElementById(`media-${e.publication.id}`);
      if (vid) vid.remove();
      console.log("🗑 Stream removed:", e.publication.id);
    });
  };
})();
