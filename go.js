#!/usr/bin/env node

var c = require('chalk'),
    fs = require('fs'),
    ora = require('ora'),
    YAML = require('yamljs'),
    queryUber = require('./queryUber'),
    clear = require('cli-clear'),
    mkdirp = require('mkdirp'),
    child = require('child_process'),
    prompt = require('syncprompt'),
    config = require('./config');

clear();
var devID = prompt('Enter Device ID to provision: ');
if (devID < 1) process.exit(-1);
var queryUberSpinner = ora('Querying Ubersmith for device data').start();
queryUber(devID, function(e, NewServer) {
    if (e) throw e;
    queryUberSpinner.succeed('Device Loaded [' + c.red.bgBlack(NewServer.ServerName) + ']!');
    var p = __dirname + '/SERVER_PROVISIONING/host_vars/' + NewServer.ServerName;
    var f = p + '/main.yml';
    var fJ = p + '/main.json';
    var os = prompt('Type an operating system, ' + c.yellow.bgBlack('centos-6') + ' or ' + c.yellow.bgBlack('centos-7') + '.\n Enter for ' + c.yellow.bgBlack('centos-6') + ': ');
    if (os == '')
        os = 'centos-6';
    NewServer.OS = os;
    var myPass = prompt('Type a root password or hit enter to generate a random password.\n  ');
    if (myPass == '')
        myPass = Math.random().toString(36).substring(11);
    NewServer.Password = myPass;
    console.log('Using root password:   ' + c.white.bgBlack.bold(NewServer.Password) + '\n');
    mkdirp(p, function(e) {
        if (e) throw e;
        var invFile = __dirname + '/SERVER_PROVISIONING/INVENTORY_' + NewServer.ServerName + '.txt';
        var invTemplate = __dirname + '/SERVER_PROVISIONING/NewServers.Template';
        var template = fs.readFileSync(invTemplate).toString();
        var playbook = __dirname + '/SERVER_PROVISIONING/ProvisionDevice.yml';
        var delSpinner = ora('Deleting Local Device files..').start();

        fs.unlinkSync(invFile);
        fs.unlinkSync(f);
        fs.unlinkSync(fJ);

        delSpinner.succeed('Deleted files:\n\t' + c.green.bgBlack(invFile) + '\n\t' + c.green.bgBlack(f) + '\n\t' + c.green.bgBlack(fJ));


        template = template + '\n[NewServers]\n' + NewServer.ServerName + '\n\n';
        var ansibleCommand = '/usr/bin/ansible-playbook ' + playbook + ' -i ' + invFile + ' -l ' + NewServer.ServerName + ' -e POWEROFF_POWERON=1';

        var writeSpinner = ora('Writing Device config files..').start();
        fs.writeFileSync(invFile, template);
        fs.writeFileSync(fJ, JSON.stringify(NewServer));
        fs.writeFileSync(f, YAML.stringify(NewServer));
        writeSpinner.succeed('Wrote files: \n\t' + c.green.bgBlack(f) + '\n\t' + c.green.bgBlack(fJ) + '\n\t' + c.green.bgBlack(invFile));
        var areYouSure = prompt('Are you sure you wish to provision device with name ' + c.red.bgBlack.bold(NewServer.ServerName) + ' as confiured in ubersmith with ' + NewServer.OS + '?\n type yes:  ');
        if (areYouSure != 'yes') process.exit();
        console.log('\n');
        //        console.log(ansibleCommand);
        var acA = ansibleCommand.split(' ');
        var cmdOut = '';
        var installLog = '/home/serverProvisioning/logs/' + NewServer.ServerName + '-' + Math.round(new Date().getTime() / 1000) + '.txt';
        var installSpinner = ora('Installing OS to server ' + NewServer.ServerName + '...').start();
        ansibleSpawn = child.spawn(acA[0], acA.slice(1, acA.length));
        ansibleSpawn.stdout.on('data', function(data) {
            cmdOut += data.toString();
            fs.appendFileSync(installLog, data.toString());
        });
        ansibleSpawn.stderr.on('data', function(data) {
            cmdOut += data.toString();
            fs.appendFileSync(installLog, data.toString());
        });
        ansibleSpawn.on('exit', function(code) {
            if (code == 0) {
                installSpinner.succeed('Server Reinstalled Succesfully!');
                console.log(c.green.bgBlack('  Please log into ' + c.white.bgBlack(NewServer.PrimaryIP) + ' using root password ' + c.white.bgBlack(NewServer.Password)));
            } else {
                console.log(cmdOut);
                installSpinner.fail('Installation process finished with code ' + code);
            }
        });
    });
});
