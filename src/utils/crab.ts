export default function crab(text: string, arg1: string, arg2?: string) {
  let r: string[];
  const j = text.split(arg1);
  j.shift();
  if (arg2) {
    r = [];
    j.forEach((v) => {
      if (v.includes(arg2)) {
        const k = v.split(arg2);
        r.push(k[0]);
      }
    });
  } else {
    r = j;
  }
  return r;
}
