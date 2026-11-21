import { deps } from './activity-deps';

// #387: the page's loaders: each library is fetched only when a ZIP or FIT file is read here.
deps.fflate = () => import('fflate');
deps.fit = () => import('@garmin/fitsdk');
