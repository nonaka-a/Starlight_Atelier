/**
 * --- 定数・設定 ---
 */
const TILE_SIZE = 64;
const GRAVITY = 0.6;
const JUMP_POWER = -14;
const SPEED = 6;
const TILESET_SRC = 'image/tileset/forest_tileset.png';
const CHAR_SRC = 'image/animations.png';
const FOREST_BGM_SRC = 'sounds/stage_bgm1.mp3';
const ATELIER_BGM_SRC = 'sounds/atelier_bgm1.mp3';
const JUMP_SE_SRC = 'sounds/jump.mp3';
const JUMP2_SE_SRC = 'sounds/jump2.mp3';
const MAP_FILE_SRC = 'json/atume_stage2.json';
const ATELIER_MAP_SRC = 'json/atelier_stage1.json';
const ANIM_FILE_SRC = 'json/animations.json';
const BULLET_SPEED = 12;

// 旧バージョン互換用IDマッピング
const DEFAULT_ID_TYPE = {
    0: 'air',
    1: 'wall',
    2: 'ground',
    3: 'spike',
    4: 'item',
    5: 'enemy',
    6: 'start', // ここは古い定義として残してもよいですが、混乱を避けるなら削除または変更
    118: 'start', // ★追加: 新しいスタート地点
    119: 'goal',  // ★追加: 新しいゴール地点
    7: 'goal'
};

// タイルの当たり判定オフセット定義
const TILE_HITBOX_OFFSET = {
    5: 32, // ID 5 (細い床) は32px下げる
};