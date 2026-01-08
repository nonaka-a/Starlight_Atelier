/**
 * --- 定数・設定 ---
 */
const TILE_SIZE = 64;
const GRAVITY = 0.6;
const JUMP_POWER = -14;
const SPEED = 6;
const TILESET_SRC = 'tileset.png';
const CHAR_SRC = 'char.png';
const MAP_FILE_SRC = 'my_stage.json'; 
const ANIM_FILE_SRC = 'animations.json';
const BULLET_SPEED = 12;

// 旧バージョン互換用IDマッピング
const DEFAULT_ID_TYPE = {
    0: 'air',
    1: 'wall',
    2: 'ground',
    3: 'spike',
    4: 'item',
    5: 'enemy',
    6: 'start',
    7: 'goal'
};

// タイルの当たり判定オフセット定義
const TILE_HITBOX_OFFSET = {
    5: 32, // ID 5 (細い床) は32px下げる
};