// --- SkyWay SDK の取り出し ---
const {
  nowInSec,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  LocalDataStream,
  uuidV4,
} = skyway_room;

(async () => {
  const joinBtn = document.getElementById("join");
  const leaveBtn = document.getElementById("leave");
  const roomNameInput = document.getElementById("room-name");
  const appIdInput = document.getElementById("app-id");
  const secretInput = document.getElementById("secret-key");
  const myIdSpan = document.getElementById("my-id");

  // --- カメラ UI 要素 ---
  const localVideoEl1 = document.getElementById("local-video-1");
  const localVideoEl2 = document.getElementById("local-video-2");
  const videoSelect1 = document.getElementById("video-select-1");
  const videoSelect2 = document.getElementById("video-select-2");

  let localVideo1 = null;
  let localVideo2 = null;
  let localAudio = null;

  let dataStream = null;
  let keepAliveInterval = null;

  let room = null;
  let me = null;

  // ============================================================
  // ✅ 利用可能なデバイスを列挙
  // ============================================================
  try {
    const cameras = await SkyWayStreamFactory.enumerateInputVideoDevices();

    cameras.forEach((cam) => {
      const opt1 = document.createElement("option");
      opt1.value = cam.id;
      opt1.text = cam.label || cam.id;
      videoSelect1.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = cam.id;
      opt2.text = cam.label || cam.id;
      videoSelect2.appendChild(opt2);
    });

    if (cameras.length > 1) {
      videoSelect2.selectedIndex = 1;
    }

    // 音声デバイスも確保しておく
    try {
      const { audio } = await SkyWayStreamFactory.createMicrophoneAudioStream();
      localAudio = audio;
      console.log("✅ Audio device ready");
    } catch (err) {
      console.warn("⚠️ Audio device not available:", err);
    }
  } catch (err) {
    console.error("⚠️ Device enumeration failed:", err);
  }

  // ============================================================
  // ✅ 参加ボタン
  // ============================================================
  joinBtn.onclick = async () => {
    const appId = appIdInput.value.trim();
    const secret = secretInput.value.trim();
    const roomName = roomNameInput.value.trim();

    if (!appId || !secret || !roomName) {
      alert("App ID / Secret Key / Room Name をすべて入力してください");
      return;
    }
    if (me) return; // 多重参加禁止

    console.log("🔑 Generating token...");
    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
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

    // TURN (relay) のみ強制
    console.log("🔌 Connecting (relay only)...");
    const context = await SkyWayContext.Create(token, {
      iceConfig: { iceTransportPolicy: "relay" },
    });

    room = await SkyWayRoom.FindOrCreate(context, {
      type: "p2p",
      name: roomName,
    });

    me = await room.join();
    myIdSpan.textContent = me.id;
    console.log("✅ Joined:", me.id);

    // ============================================================
    // ✅ カメラ Publish
    // ============================================================
    try {
      // ---- 1台目 ----
      const cam1 = videoSelect1.value;
      if (cam1) {
        const { video } = await SkyWayStreamFactory.createCameraStream({
          deviceId: cam1,
          maxWidth: 640,
          maxHeight: 480,
        });
        localVideo1 = video;
        localVideo1.attach(localVideoEl1);
        await localVideoEl1.play();
        await me.publish(localVideo1);
        console.log("✅ Video1 published:", cam1);
      }

      // ---- 2台目 ----
      const cam2 = videoSelect2.value;
      if (cam2 && cam2 !== cam1) {
        const { video } = await SkyWayStreamFactory.createCameraStream({
          deviceId: cam2,
          maxWidth: 640,
          maxHeight: 480,
        });
        localVideo2 = video;
        localVideo2.attach(localVideoEl2);
        await localVideoEl2.play();
        await me.publish(localVideo2);
        console.log("✅ Video2 published:", cam2);
      }

      // ---- 音声 ----
      if (localAudio) {
        await me.publish(localAudio);
        console.log("✅ Audio published");
      }

      // ============================================================
      // ✅ KeepAlive（SFU/P2P 30秒切断対策）
      // ============================================================
      dataStream = new LocalDataStream();
      await me.publish(dataStream);
      console.log("✅ KeepAlive stream published");

      let pingID = 0;
      keepAliveInterval = setInterval(() => {
        if (dataStream && me) {
          dataStream.write("ping " + pingID++);
          console.log("PING:", pingID);
        }
      }, 10000);
    } catch (err) {
      console.error("🔥 Publish failed:", err);
    }

    // ============================================================
    // ✅ リモート映像の受信
    // ============================================================
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      console.log("📡 Incoming stream:", e.publication.id);

      const { stream } = await me.subscribe(e.publication);

      if (stream.track.kind === "video") {
        const vid = document.createElement("video");
        vid.autoplay = true;
        vid.playsInline = true;
        stream.attach(vid);
        document.getElementById("remote-media-area").appendChild(vid);
        console.log("✅ Remote video attached");
      }
    });
  };

  // ============================================================
  // ✅ 退出ボタン
  // ============================================================
  leaveBtn.onclick = async () => {
    if (!me) return;

    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    try {
      await me.leave();
      await room.dispose();
      myIdSpan.textContent = "";
      room = null;
      me = null;
      console.log("🏃 Left room");
    } catch (err) {
      console.error("退出失敗:", err);
    }
  };
})();    // ✅ ←←← IIFE を正しく閉じる
