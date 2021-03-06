'use strict';
const fs = require('fs-extra');
const path = require('path');
const includes = require('lodash/includes');
const lastLines = require('read-last-lines');
const Tail = require('tail').Tail;
const Promise = require('bluebird');
const PrettyStream = require('ghost-ignition/lib/logging/PrettyStream');

const errors = require('../errors');
const Command = require('../command');

class LogCommand extends Command {
    run(argv) {
        if (!argv.name) {
            Command.checkValidInstall('log');
        }

        let instance = this.system.getInstance(argv.name);

        if (!instance) {
            return Promise.reject(new errors.SystemError(`Ghost instance '${argv.name}' does not exist`));
        }

        if (instance.running) {
            instance.loadRunningEnvironment();
        } else {
            instance.checkEnvironment();
        }

        // Check if logging file transport is set in config
        if (!includes(instance.config.get('logging.transports', []), 'file')) {
            // TODO: fallback to process manager log retrieval?
            return Promise.reject(new errors.ConfigError({
                config: {
                    'logging.transports': instance.config.get('logging.transports').join(', ')
                },
                message: 'You have excluded file logging in your ghost config.' +
                    'Please add it to your transport config to use this command.',
                environment: this.system.environment
            }));
        }

        let logFileName = path.join(instance.dir, 'content/logs', `${instance.config.get('url').replace(/[^\w]/gi, '_')}_${this.system.environment}.log`);
        let prettyStream = new PrettyStream();

        if (!fs.existsSync(logFileName)) {
            if (argv.follow) {
                this.ui.log('Log file has not been created yet, `--follow` only works on existing files', 'yellow');
            }

            return Promise.resolve();
        }

        prettyStream.on('error', (error) => {
            if (!(error instanceof SyntaxError)) {
                throw error;
            }
        });

        prettyStream.pipe(this.ui.stdout);

        return lastLines.read(logFileName, argv.number).then((lines) => {
            lines.trim().split('\n').forEach(line => prettyStream.write(line));

            if (argv.follow) {
                let tail = new Tail(logFileName);
                tail.on('line', (line) => prettyStream.write(line, 'utf8'));
            }
        });
    }
}

LogCommand.description = 'View the logs of a Ghost instance';
LogCommand.params = '[name]';
LogCommand.options = {
    number: {
        alias: 'n',
        description: 'Number of lines to view',
        default: 20,
        type: 'number'
    },
    follow: {
        alias: 'f',
        description: 'Follow the log file (similar to `tail -f`)',
        type: 'boolean'
    }
};
LogCommand.global = true;

module.exports = LogCommand;
