
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
  const leaveBtn = document.getElementById("leave");
  const roomNameInput = document.getElementById("room-name");
  const appIdInput = document.getElementById("app-id");
  const secretInput = document.getElementById("secret-key");
  const myIdSpan = document.getElementById("my-id");
  const localVideoEl = document.getElementById("local-video"); // HTMLのvideoタグ
  const remoteArea = document.getElementById("remote-media-area");

  let localVideo = null; // 映像ストリーム
  let localAudio = null; // 音声ストリーム
  let room = null;
  let me = null;

  // カメラ取得（失敗しても受信専用で動作）
  try {
    const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
    localVideo = video;
    localAudio = audio;
    // ローカルプレビュー
    localVideo.attach(localVideoEl);
    await localVideoEl.play();
    console.log("✅ Camera available, local preview started");
  } catch (err) {
    console.warn("⚠️ Camera not available, running as receive-only");
  }

  // --- Subscribe処理（関数として定義）---
  const subscribeAndAttach = async (publication) => {
    if (publication.publisher.id === me.id) return; // 自分のは無視
    if (document.getElementById(`media-${publication.id}`)) return; // 既に表示済み

    console.log("📡 [Stream Found] 相手のストリームを発見:", publication.id);

    try {
      console.log(`[Subscribing] ${publication.id} を Subscribeします...`);
      const { stream } = await me.subscribe(publication);

      let newMedia;
      switch (stream.track.kind) {
        case "video":
          newMedia = document.createElement("video");
          newMedia.id = `media-${publication.id}`; // 削除できるようにIDを付与
          newMedia.autoplay = true;
          newMedia.playsInline = true;
          break;
        case "audio":
          newMedia = document.createElement("audio");
          newMedia.id = `media-${publication.id}`;
          newMedia.autoplay = true;
          newMedia.controls = true;
          break;
        default:
          return;
      }
      stream.attach(newMedia);
      remoteArea.appendChild(newMedia);
      console.log("✅ [Attached] リモートストリームを画面に表示しました");

    } catch (err) {
      console.error(`[Subscribe Error] ${publication.id} のSubscribeに失敗:`, err);
    }
  };

  // --- 退出時のストリーム削除処理 ---
  const removeRemoteStream = (publication) => {
    const media = document.getElementById(`media-${publication.id}`);
    if (media) {
        media.srcObject = null;
        media.remove();
        console.log(`[Removed] ${publication.id} を削除`);
    }
  };


  joinBtn.onclick = async () => {
    const appId = appIdInput.value.trim();
    const secret = secretInput.value.trim();
    const roomName = roomNameInput.value.trim();

    if (!appId || !secret || !roomName) {
      alert("App ID / Secret Key / Room Name をすべて入力してください");
      return;
    }
    if (me) return; // 既に入室済み

    console.log("🔑 Generating token...");
    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      version: 3,
      scope: {
        appId,
        rooms: [ { name: "*", methods: ["create", "close"], member: { name: "*", methods: ["publish", "subscribe"] } } ],
      },
    }).encode(secret);
    console.log("✅ Token created");

    console.log("🔌 Connecting...");
    const context = await SkyWayContext.Create(token, {
      iceConfig: { iceTransportPolicy: "relay" }, // TURN強制 (P2P失敗対策)
    });

    room = await SkyWayRoom.FindOrCreate(context, { 
      type: "p2p", // SFUモードを使用
      name: roomName 
    });
    me = await room.join();
    myIdSpan.textContent = me.id;
    console.log("✅ Joined:", me.id);

    // カメラがある場合のみ Publish
    if (localVideo) {
      await me.publish(localAudio);
      await me.publish(localVideo);
      console.log("✅ Video/Audio published");
    }

    // ★★★ 受信漏れ対策 ★★★
    // --- 既存ストリームのチェック ---
    console.log("--- 既存ストリームをチェックします ---");
    room.publications.forEach((publication) => {
        subscribeAndAttach(publication);
    });
    // ★★★ 対策ここまで ★★★

    // 他の参加者の映像受信
    room.onStreamPublished.add(async (e) => {
      subscribeAndAttach(e.publication);
    });

    // 退出時に映像を削除
    room.onStreamUnpublished.add((e) => {
      removeRemoteStream(e.publication);
    });
    // メンバーが退出した時も映像を削除
    room.onMemberLeft.add((e) => {
        room.publications.forEach(pub => {
            if (pub.publisher.id === e.member.id) {
                removeRemoteStream(pub);
            }
        });
    });
  };

  // --- 退出ボタンの処理 ---
  leaveBtn.onclick = async () => {
    if (!me) return;
    try {
      await me.leave();
      await room.dispose();
      myIdSpan.textContent = '';
      remoteArea.innerHTML = '';
      room = null;
      me = null;
      console.log('🏃 Left room');
    } catch (err) {
      console.error('退出処理に失敗:', err);
    }
  };

})();
