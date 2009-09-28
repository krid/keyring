#!/bin/sh
#
# Simple script to package up Keyring into a nice .ipk
#
# Keyring for webOS - Easy password management on your phone.
# Copyright (C) 2009, Dirk Bergstrom, keyring@otisbean.com
#     
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#########

DESTDIR=/tmp

srcdir=`dirname $0`

palm-package -o $DESTDIR \
    --no-exclude-eclipse \
    --exclude=framework_config.json \
    $srcdir