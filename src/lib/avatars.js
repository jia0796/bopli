export const AVATARS = [
  {id:'coral',label:'珊瑚微笑',background:'#FFEAE2',color:'#F6A08B',eyes:'#FFFFFF'},
  {id:'peach',label:'蜜桃朋友',background:'#FFF1E9',color:'#FFE0D5',eyes:'#24334F'},
  {id:'navy',label:'深藍夥伴',background:'#E9EDF3',color:'#24334F',eyes:'#FFFFFF'},
  {id:'duo',label:'雙人同行',background:'#FFF9F5',color:'#F6A08B',eyes:'#FFFFFF'},
];
export const DEFAULT_AVATAR='coral';
export const avatarFor=id=>AVATARS.find(avatar=>avatar.id===id)||AVATARS[0];
export function selectAvatar(store,userId,avatarId) {
  if(!store.users[userId])throw new Error('找不到帳號');
  if(!AVATARS.some(avatar=>avatar.id===avatarId))throw new Error('請選擇內建頭像');
  return {...store,users:{...store.users,[userId]:{...store.users[userId],avatarId}}};
}
