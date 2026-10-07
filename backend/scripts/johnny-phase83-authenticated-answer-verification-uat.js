'use strict';

process.env.JOHNNY_PHASE82_MULTI_SOURCE = '1';
process.env.JOHNNY_PHASE83_ANSWER_VERIFICATION = '1';
if (process.env.JOHNNY_PHASE81_SKIP_BROWSER === undefined) {
    process.env.JOHNNY_PHASE81_SKIP_BROWSER = '1';
}

require('./johnny-phase81-authenticated-local-uat');
