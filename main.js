// --- SkyWay SDK の取り出し ---
const {
  nowInSec,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  LocalDataStream, // ★ DataStream をインポート
  uuidV4,
} = skyway_room;

(async () => {
  const joinBtn = document.getElementById("join");
  const leaveBtn = document.getElementById("leave");
  const roomNameInput = document.getElementById("room-name");
  const appIdInput = document.getElementById("app-id");
  const secretInput = document.getElementById("secret-key");
  const myIdSpan = document.getElementById("my-id");

  // --- ★ カメラ選択機能（ここから） ★ ---
  const localVideoEl1 = document.getElementById("local-video-1"); 
  const localVideoEl2 = document.getElementById("local-video-2");
  const videoSelect1 = document.getElementById("video-select-1");
  const videoSelect2 = document.getElementById("video-select-2");

  let localVideo1 = null; 
  let localVideo2 = null;
  let localAudio = null;
  let dataStream = null; // ★ Keep-Alive用
  let keepAliveInterval = null; // ★ Keep-Alive用
  let room = null;
  let me = null;

  // 利用可能なカメラデバイスを<select>に追加する
  try {
    const devices = await SkyWayStreamFactory.enumerateInputVideoDevices();
    devices.forEach((device) => {
      const option1 = document.createElement("option");
      option1.value = device.id;
      option1.text = device.label || device.id;
      videoSelect1.appendChild(option1);

      const option2 = document.createElement("option");
      option2.value = device.id;
      option2.text = device.label || device.id;
      videoSelect2.appendChild(option2);
    });

    // 2台目がある場合は、デフォルトで2台目を選択しておく
    if (devices.length > 1) {
      videoSelect2.selectedIndex = 1;
    }
    
    // （音声デバイスも取得しておく）
    const { audio } = await SkyWayStreamFactory.createMicrophoneAudioStream();
    localAudio = audio;
    console.log("✅ Audio device found");

  } catch (err) {
    console.error("⚠️ Device enumeration failed:", err);
  }
  // --- ★ カメラ選択機能（ここまで） ★ ---


  joinBtn.onclick = async () => {
  	const appId = appIdInput.value.trim();
  	const secret = secretInput.value.trim();
  	const roomName = roomNameInput.value.trim();
  	if (!appId || !secret || !roomName) {
  	  alert("App ID / Secret Key / Room Name をすべて入力してください");
  	  return;
  	}
    if (me) return; 

  	console.log("🔑 Generating token...");
  	const token = new SkyWayAuthToken({
  	  jti: uuidV4(),
  	  iat: nowInSec(),
  	  exp: nowInSec() + 60 * 60 * 24, 
  	  scope: {
  	 	  appId,
  	 	  rooms: [ { name: "*", methods: ["create", "close"], member: { name: "*", methods: ["publish", "subscribe"] } } ],
  	  },
  	}).encode(secret);
    
    console.log("✅ Token created");
    
  	console.log("🔌 Connecting (Forcing P2P+Relay)...");
  	const context = await SkyWayContext.Create(token, {
  	  iceConfig: { iceTransportPolicy: "relay" }, // TURN強制
  	});

  	room = await SkyWayRoom.FindOrCreate(context, { 
      type: "p2p", // P2Pルーム
      name: roomName 
    });
  	me = await room.join();
    myIdSpan.textContent = me.id;
  	console.log("✅ Joined:", me.id);

    // --- ★ 選択されたカメラでPublish処理（ここから） ★ ---
    try {
      // 1台目（RGB）のカメラストリームを生成・Publish
      const selectedCam1 = videoSelect1.value;
      if (selectedCam1) {
        const { video } = await SkyWayStreamFactory.createCameraStream({
          deviceId: selectedCam1,
          // SLAM用に 640x480 を強制
          maxWidth: 640,
          maxHeight: 480,
        });
        localVideo1 = video;
        localVideo1.attach(localVideoEl1);
        await localVideoEl1.play();
        await me.publish(localVideo1);
        console.log("✅ Video 1 (RGB) published");
      }

      // 2台目（サーマル）のカメラストリームを生成・Publish
      const selectedCam2 = videoSelect2.value;
      if (selectedCam2 && selectedCam2 !== selectedCam1) {
        const { video } = await SkyWayStreamFactory.createCameraStream({
          deviceId: selectedCam2,
          maxWidth: 640,
          maxHeight: 480,
        });
        localVideo2 = video;
        localVideo2.attach(localVideoEl2);
        await localVideoEl2.play();
        await me.publish(localVideo2);
        console.log("✅ Video 2 (Thermal) published");
      }

      // 音声もPublish
      if (localAudio) { 
        await me.publish(localAudio);
        console.log("✅ Audio published"); 
      }

      // --- ★ キープアライブ（30秒タイムアウト対策） ★ ---
      dataStream = new LocalDataStream();
      await me.publish(dataStream);
      console.log("✅ Keep-Alive DataStream published");
      
      let count = 0;
      keepAliveInterval = setInterval(() => {
        if (dataStream && me) {
            const msg = `KeepAlive Ping ${count++}`;
            dataStream.write(msg);
            console.log(`PING > ${msg}`);
        }
      }, 10000); // 10秒ごとにPingを送信
      // --- ★ キープアライブ（ここまで） ★ ---

    } catch (err) {
      console.error("🔥 Publish failed:", err);
    }
    // --- ★ Publish処理（ここまで） ★ ---
F  };

  leaveBtn.onclick = async () => {
    if (!me) return;

    // ★ Keep-Aliveを停止
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    try {
      await me.leave();
      await room.dispose();
      myIdSpan.textContent = '';
      room = null; me = null;
      console.log('🏃 Left room');
    } catch (err) {
      console.error('退出処理に失敗:', err);
    }
  };
  
})(); // <-- ★★★ この最後の行 `})();` が欠けていませんか？ ★★★