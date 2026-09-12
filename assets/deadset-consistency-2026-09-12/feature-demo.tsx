import React from "/Users/theojandhyala/deadset/node_modules/react/index.js";
import { renderToStaticMarkup } from "/Users/theojandhyala/deadset/node_modules/react-dom/server.node.js";
import {TrainingHeatmap} from "/Users/theojandhyala/deadset/src/components/TrainingHeatmap.tsx";
const sessions=[];const completedDates=[];
for(let i=0;i<84;i++){const date=new Date(Date.UTC(2026,5,21+i)).toISOString().slice(0,10);if([1,3,5].includes(new Date(date).getUTCDay())){completedDates.push(date);sessions.push({date,endedAt:date+'T19:00:00Z',totalVolume:2400+(i%9)*350});}}
console.log(renderToStaticMarkup(<TrainingHeatmap state={{sessions,completedDates} as any}/>));
