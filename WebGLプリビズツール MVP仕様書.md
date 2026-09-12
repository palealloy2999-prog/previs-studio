# WebGLプリビズツール MVP仕様書

## 1. 目的

AI動画生成用のプリビズを、ブラウザ上で簡単に作成するためのWebアプリを開発する。

複数の簡易キャラクターやオブジェクトとカメラを3D空間に配置し、タイムライン上で位置・回転を変化させることで、簡易的なプリビズ動画を作成する。

完成したプリビズはWebGL上でプレビューでき、MP4として保存できること。

また、編集内容はJSONファイルとして保存・読み込み可能とする。

このツールは高機能な3Dアニメーションソフトを目的としない。

主目的は以下。

- キャラクターやオブジェクトの位置関係確認
- 移動方向確認
- カメラワーク確認
- ショットのタイミング確認
- AI動画生成時に渡すリファレンス動画の作成

---

# 2. 技術構成

推奨構成。

- TypeScript
- React
- Vite
- Three.js
- WebGL
- ffmpeg.wasm または WebCodecs
- CSSは任意
- 状態管理はReact標準、またはZustand程度の軽量構成

巨大なフレームワークやバックエンドは不要。

基本的にはクライアントサイドWebアプリとして実装する。

ただし、外部GLBアセットの自動検出については、Vite開発サーバーまたはNode.js側でディレクトリを走査してモデル一覧を生成する。

---

# 3. 画面構成

画面は基本的に3ペイン構成とする。

```text
┌──────────────┬─────────────────────────────────┐
│              │                                 │
│ Object List  │          3D Viewport            │
│              │                                 │
│              │                                 │
│              │                                 │
├──────────────┴─────────────────────────────────┤
│                                               │
│                  Timeline                     │
│                                               │
└───────────────────────────────────────────────┘
```

## 3.1 左ペイン

オブジェクト一覧および追加可能アセット一覧。

例。

```text
Scene

Objects
■ Character A
■ Character B
■ Cube
■ Robot

Camera
● Camera 01

Assets
[ Mannequin ]
[ Robot ]
[ Car ]
[ Crate ]
```

必要操作。

- オブジェクト追加
- オブジェクト削除
- オブジェクト選択
- オブジェクト名変更
- オブジェクト色変更

---

# 4. オブジェクト

## 4.1 標準オブジェクト

アプリには最低限、簡易的なプリミティブオブジェクトを標準搭載する。

例。

- Box
- Sphere
- Cylinder
- 簡易人型

簡易人型は高精細モデルである必要はない。

最低限以下が視認できること。

- 頭
- 胴体
- 腕
- 脚
- 前後方向

複数の簡易人型は同じモデルを使い、色のみ変更可能とする。

例。

```text
Character A = 赤
Character B = 青
Character C = 緑
Character D = 黄
```

前後方向が分かるようにする。

例。

- 顔側に小さな突起
- 胸側に三角マーク
- 前面のみ別色

---

# 5. 外部3Dアセット

## 5.1 対応形式

外部3Dモデル形式は以下に限定する。

```text
.glb
```

形式は glTF 2.0 Binary とする。

OBJ、FBX、DAEなどはMVPでは対応しない。

---

# 6. 外部GLBアセットの配置

外部モデルは以下のディレクトリに配置する。

```text
assets/models/
```

例。

```text
assets/
└─ models/
   ├─ mannequin.glb
   ├─ robot.glb
   ├─ car.glb
   ├─ crate.glb
   └─ drone.glb
```

ユーザーは、このフォルダに `.glb` ファイルを追加するだけでよい。

モデルごとの設定JSONやmanifestファイルは必要としない。

---

# 7. GLB自動検出

アプリ起動時またはVite開発サーバー起動時に、

```text
assets/models/
```

以下を自動走査する。

`.glb` ファイルをすべて検出し、モデル一覧を自動生成する。

モデル追加時にアプリ本体のソースコードを変更する必要がない構成とする。

ユーザー操作。

```text
新しいGLBを assets/models/ にコピー
↓
アプリ再起動
↓
Assets一覧へ自動追加
```

開発環境では可能であればファイル監視を行い、GLB追加時に一覧を自動更新してもよい。

ただし、MVPではアプリ再起動後に認識できれば十分とする。

---

# 8. GLB一覧生成

ViteまたはNode.js側で、

```text
assets/models/*.glb
```

を走査する。

内部的にはモデル一覧データを生成し、フロントエンドから参照可能にする。

manifest.jsonをユーザーが手作業で管理する方式は禁止する。

モデル一覧はファイル構成から自動生成すること。

---

# 9. GLB表示名

UI上の表示名はファイル名から自動生成する。

例。

```text
robot.glb
→ Robot
```

```text
robot_soldier.glb
→ Robot Soldier
```

```text
large-crate.glb
→ Large Crate
```

拡張子を除去し、`_` や `-` はスペースへ変換する。

---

# 10. GLB読み込み

Three.jsの `GLTFLoader` を使用する。

読み込んだGLBは通常のオブジェクトと同様に扱う。

外部GLBも以下の操作に対応する。

- XYZ移動
- XYZ回転
- 色変更
- 複製
- 削除
- キーフレーム登録

GLB内部にアニメーションが存在しても、MVPでは再生しない。

---

# 11. オブジェクトの色変更

GLBは可能な範囲でThree.js側からMaterialの色を変更可能とする。

特に人物モデルについては、1つのGLBを複数配置し、色違いで使用できること。

例。

```text
mannequin.glb

Character A = Red
Character B = Blue
Character C = Green
```

GLBごとに色違いファイルを作成する必要はない。

ただし、特殊Material等により色変更できないGLBについては、元のMaterialをそのまま表示してよい。

---

# 12. オブジェクトの編集項目

すべてのオブジェクトについて以下を設定可能とする。

```text
Position
X
Y
Z

Rotation
X
Y
Z
```

移動や回転はThree.jsのTransformControls等を使用してViewport上でも操作できること。

数値入力でも編集可能とする。

Scale編集はMVPでは不要。

---

# 13. カメラ

シーン内にカメラを1台配置する。

MVPでは複数カメラ対応は不要。

カメラは3D Viewport内で視覚的に確認可能とする。

以下を表示する。

- カメラ本体
- 向いている方向
- Frustum

---

# 14. カメラ設定

基本設定。

```text
Position
X
Y
Z

Rotation / Target
X
Y
Z

FOV
```

以下のカメラワークを簡単に設定可能にする。

```text
FIX
PAN
TILT
DOLLY IN
DOLLY OUT
TRUCK LEFT
TRUCK RIGHT
CRANE UP
CRANE DOWN
ZOOM IN
ZOOM OUT
ORBIT
DRONE
```

プリセットは内部的にはカメラのPosition / Rotation / Target / FOVの変化として処理する。

---

# 15. カメラワークの扱い

## FIX

カメラ位置固定。

## PAN

カメラ位置は変更せず、左右方向へRotationまたはTargetのみ変更。

## TILT

カメラ位置は変更せず、上下方向へRotationまたはTargetのみ変更。

## DOLLY

カメラ自体を前後移動。

FOVは原則固定。

## ZOOM

カメラ位置は固定。

FOVのみ変更。

DollyとZoomは別物として扱う。

## TRUCK

カメラを左右へ水平移動。

## CRANE

カメラを上下方向へ移動。

## ORBIT

指定Targetを中心として円弧移動。

設定項目例。

```text
Target
Start Angle
End Angle
Radius
Height
```

## DRONE

Start位置からEnd位置へ滑らかに移動しながらTargetを見る。

補間はLinearではなく、滑らかな補間を使用する。

---

# 16. 3D Viewport

中央ペインをThree.jsによる3D編集画面とする。

通常時は編集用カメラを使用する。

以下を実装する。

- OrbitControls
- Grid表示
- World Axis表示
- オブジェクト選択
- TransformControls
- カメラ位置確認
- Frustum表示

Viewport右上などに小さなCamera Previewを表示する。

```text
┌───────────────────┐
│ CAMERA PREVIEW    │
│                   │
│        ■          │
│                   │
└───────────────────┘
```

Camera Previewには本番カメラ映像を表示する。

編集カメラとは別とする。

---

# 17. タイムライン

画面下部をタイムラインとする。

例。

```text
           0s       2s       4s       6s

Character A ◆────────◆────────────◆

Character B      ◆──────────◆

Robot       ◆────────────────────◆

Camera      ◆──────◆────────◆
```

タイムラインには各オブジェクトのキーフレームを表示する。

対象。

- 標準プリミティブ
- 簡易人型
- 外部GLB
- Camera

---

# 18. キーフレーム

オブジェクト。

```text
time
position
rotation
```

カメラ。

```text
time
position
rotation または target
fov
```

キーフレーム間は補間する。

基本補間。

```text
Linear
Ease In
Ease Out
Ease In-Out
```

最低限LinearがあればMVPとして成立する。

---

# 19. オブジェクト移動について

Walk、Run、Sprintなどのアニメーション機能は実装しない。

移動速度は、キーフレーム間の距離と時間によって表現する。

例。

```text
0秒
Position X = 0

1秒
Position X = 10
```

であれば高速移動。

```text
0秒
Position X = 0

5秒
Position X = 10
```

であれば低速移動。

手足のアニメーションは行わない。

---

# 20. 再生機能

以下を設置。

```text
[ Play ]
[ Stop ]
[ Loop ]
```

Play時、現在のシーンデータをリアルタイム再生する。

タイムライン上にPlayheadを表示する。

Playheadはマウスでドラッグ可能とする。

ドラッグするとシーンもリアルタイムに該当時刻へ更新する。

スクラブ可能とする。

---

# 21. シーン設定

最低限以下。

```text
Duration
FPS
Resolution
```

初期値。

```text
Duration: 10 sec
FPS: 30
Resolution: 1280x720
```

Durationは変更可能とする。

FPSとResolutionはMVPでは固定でもよい。

---

# 22. 動画書き出し

保存ボタン。

```text
[ Export MP4 ]
```

押下すると、本番カメラの映像を動画として保存する。

推奨。

```text
1280x720
30fps
MP4
H.264
```

方法は以下どちらでもよい。

- WebCodecs
- Canvas + MediaRecorder + ffmpeg.wasm

最終ファイルはMP4とする。

可能であればフレーム単位でレンダリングする方式を優先する。

プレビュー時のPC負荷によって動画のFPSが変化しないようにするため。

---

# 23. JSON保存

現在のシーン状態をJSONとして保存可能とする。

```text
[ Save JSON ]
```

外部GLBについては、GLBファイルそのものをJSONへ埋め込まない。

ファイル名または相対パスのみ保存する。

例。

```json
{
  "version": 1,
  "duration": 10,
  "fps": 30,
  "resolution": {
    "width": 1280,
    "height": 720
  },
  "objects": [
    {
      "id": "object_01",
      "name": "Character A",
      "asset": "mannequin.glb",
      "color": "#ff4d4d",
      "keyframes": [
        {
          "time": 0,
          "position": [0, 0, 0],
          "rotation": [0, 0, 0]
        },
        {
          "time": 3,
          "position": [5, 0, -2],
          "rotation": [0, 90, 0]
        }
      ]
    }
  ],
  "camera": {
    "fov": 50,
    "keyframes": [
      {
        "time": 0,
        "position": [0, 2, 8],
        "target": [0, 1, 0],
        "fov": 50
      },
      {
        "time": 3,
        "position": [3, 3, 5],
        "target": [5, 1, -2],
        "fov": 50
      }
    ]
  }
}
```

Rotationの単位はJSON上ではEuler角を推奨する。

---

# 24. JSON読み込み

```text
[ Load JSON ]
```

JSONを選択すると現在のSceneを破棄して復元する。

以下を復元する。

- Duration
- FPS
- Resolution
- Objects
- 使用GLB
- Object colors
- Object keyframes
- Camera
- Camera keyframes

JSON内で指定されているGLBが

```text
assets/models/
```

に存在しない場合は、エラー表示する。

アプリ自体はクラッシュさせない。

例。

```text
Missing asset:
robot.glb
```

version項目を必ず保持する。

---

# 25. UI例

上部Toolbar。

```text
[ New ]
[ Load JSON ]
[ Save JSON ]

[ Play ]
[ Stop ]
[ Loop ]

[ Export MP4 ]
```

全体。

```text
┌────────────────────────────────────────────────────────────┐
│ New | Load | Save     Play | Stop | Loop     Export MP4   │
├───────────────┬────────────────────────────────────────────┤
│ Scene         │                                            │
│ ■ Character A │                                            │
│ ■ Character B │              3D VIEWPORT                  │
│ ■ Robot       │                                            │
│               │                              ┌──────────┐ │
│ Assets        │                              │ Camera   │ │
│ Mannequin     │                              │ Preview  │ │
│ Robot         │                              └──────────┘ │
│ Car           │                                            │
├───────────────┴────────────────────────────────────────────┤
│ Timeline                                                   │
│ Character A   ◆────────────◆                               │
│ Character B       ◆────────────────◆                       │
│ Robot         ◆────────────────────────◆                   │
│ Camera        ◆──────◆────────────◆                        │
│                                                            │
│ 0s          2s          4s          6s          8s         │
└────────────────────────────────────────────────────────────┘
```

---

# 26. 操作フロー

1. アプリを開く
2. `assets/models/` 内のGLBを自動検出
3. Assets一覧へ表示
4. 必要なオブジェクトをシーンへ追加
5. 色を設定
6. 0秒位置を設定
7. タイムラインを3秒へ移動
8. オブジェクト位置を移動
9. キーフレーム追加
10. カメラ位置を設定
11. カメラキーフレーム設定
12. Play
13. Camera Preview確認
14. 修正
15. Export MP4
16. Save JSON

---

# 27. MVPで実装しないもの

以下は実装対象外。

- 歩行アニメーション
- 走行アニメーション
- IK
- モーションキャプチャ
- キャラクターリグ編集
- GLB内部アニメーション再生
- OBJ対応
- FBX対応
- テクスチャ編集
- ライティング編集
- 高度なマテリアル編集
- VFX
- パーティクル
- 音声
- BGM
- 複数カメラ
- カット編集
- AI生成
- 自然言語入力
- クラウド保存
- ユーザーアカウント

このツールの目的は、

**位置・方向・速度・カメラワーク・タイミング**

の確認である。

---

# 28. 設計方針

BlenderやAfter Effectsの簡易版を目指さない。

ユーザーが確認したいのは、

```text
何が
どこにいて
どちらを向いて
いつ
どこへ移動し
カメラがどう動くか
```

だけ。

UIを複雑にしない。

基本操作。

```text
アセット選択
↓
配置
↓
キーフレーム
↓
再生
↓
MP4
```

---

# 29. 完了条件

以下がすべて動作したらMVP完成とする。

- ブラウザで起動可能
- Three.js Viewportが表示される
- 標準プリミティブを配置できる
- `assets/models/` 内のGLBを自動検出できる
- GLBをコード修正なしで追加できる
- GLBをシーンへ追加できる
- 同一GLBを複数配置できる
- オブジェクトごとに色変更できる
- XYZ移動可能
- XYZ回転可能
- キーフレームを登録できる
- 時間経過で位置・回転が補間される
- カメラを配置できる
- カメラ移動をキーフレーム化できる
- FOVを変更できる
- Camera Previewが表示される
- Play / Stopが動作する
- Timelineをスクラブできる
- JSON保存できる
- JSON読み込みで完全復元できる
- MP4を書き出せる

---

# 30. 実装時の優先順位

## Phase 1

Three.js基本シーン。

- Grid
- Primitive Object
- Camera
- TransformControls

## Phase 2

GLBアセットシステム。

- `assets/models/` 自動走査
- GLB一覧生成
- GLTFLoader
- Assets UI
- シーン追加

## Phase 3

Timeline。

- Current Time
- Keyframe
- Interpolation
- Scrub

## Phase 4

Camera Preview。

- Main Camera
- FOV
- Camera Frustum

## Phase 5

JSON。

- Save
- Load

## Phase 6

Video Export。

- Frame Rendering
- MP4 Encoding

## Phase 7

Camera Presets。

- Pan
- Tilt
- Dolly
- Zoom
- Orbit
- Drone

Camera Presetsは基本機能完成後に実装する。

---

# 31. 開発時の注意

最初から全機能を一気に作らないこと。

まず、

```text
1 Object
+
1 Camera
+
2 Keyframes
+
Play
```

が確実に動く状態を作る。

その後、

```text
GLB自動検出
↓
複数Object
↓
Timeline UI
↓
JSON
↓
MP4
```

の順で追加する。

UIの豪華さよりも、

- Scene
- Asset Loader
- Timeline
- Playback

のデータ構造を優先して設計すること。

特に外部アセットについては、

**GLBをフォルダへ追加するだけで利用できる**

という操作性を維持すること。