const express = require('express');

const {
  ProjectModel,
  UsersProjectRolesModel,
  ProjectCustomFieldsModel,
  ProjectNotificationModel,
  ProjectActivityMessagesModel,
  ProjectProfileCategoryModel,
  ProjectProfilesModel
} = require('../../../models/project');

import { validate } from '../../../schema';
import { NewProfileSchema, UpdateProfileSchema } from '../../../schema/project';
import { UserError, NotFoundError } from '../../../errors';
import { successBody } from './utils';
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
import { accessControl, checkRole, setMiddleware } from './access-control-middleware';
import { removeAllAccess } from '../../../auth/jwt';
import { getProjectForUser } from '../../../models/user_project';
import { Scopes, RoleTypes } from '../../../models/roles_list';
export const profileRouter = express.Router();
export const profileResourceRouter = express.Router();


var whenCondition = function (projectprofile, req) {
  return ((req.profile.project_id === req.header_project_id) && (req.projectIdList.indexOf(req.header_project_id) !== -1));
}


const sequelize = require('../../../sequelize');

var itemFilterCondition = function (projectprofile, req) {
  return (req.projectFilter)
}

accessControl.addPermissions({
  [Scopes.REQUISITION_SCOPE]: {
    can: [
      {
        name: 'project-profile:list',
        itemFilter: itemFilterCondition
      }
    ]
  },
  [Scopes.PROJECT_SCOPE]: {
    can: [
      {
        name: 'project-profile:create',
        when: (projectprofile, req) => {
          return req.projectIdList.indexOf(req.category.project_id) !== -1;
        }
      },
      {
        name: 'project-profile:read',
        when: whenCondition
      },
      {
        name: 'project-profile:list',
        itemFilter: itemFilterCondition
      },
      {
        name: 'project-profile:edit',
        when: whenCondition
      },
      {
        name: 'project-profile:delete',
        when: whenCondition
      },
    ]
  },
  [Scopes.ADMIN_SCOPE]: {
    can: [
      'project-profile:create',
      'project-profile:list',
      'project-profile:read',
      'project-profile:edit',
      'project-profile:delete'
    ]
  }
});

profileRouter.post('/',
  validate({ body: NewProfileSchema }),
  checkRole('project-profile:create'),
  (req, res, next) => {
    
    const { title, min_rate, max_rate, status, description } = req.body;
    ProjectProfilesModel.findOne({
      //limit: 1,
      where: {
        project_id:req.category.project_id,
        category_id:req.category.id,title:title
        //your where conditions, or without them if you need ANY entry
      }
    }).then(function(entries){
      
      if(entries == undefined || entries == null || Object.keys(entries).length <= 0){       
        ProjectProfilesModel.create({
          title,
          min_rate,
          max_rate,
          status,
          description,
          category_id: req.category.id,
          project_id: req.category.project_id,
        }).
        then(profile => res.send(successBody({ message: 'New project profile created successfully', profile: profile.get() }))).
        catch(next);
      } else {
        res.send(successBody({ message: 'title already exist', profile: {} }));
      }
      
    }).catch(next);

    
   
  });


profileRouter.get('/list',
  setMiddleware,
  checkRole('project-profile:list'),
  (req, res, next) => {
    const { offset, limit, order, order_field } = req.query;
    const selector = {};

    selector.where = req.permission.itemFilter;

    if (req.category) {
      selector.where = { [Op.and]: [{ category_id: req.category.id, project_id: req.category.project_id, }, selector.where] };
    }

    if (offset) {
      selector.offset = parseInt(offset);
    }
    if (limit) {
      selector.limit = parseInt(limit);
    }
    if (req.orderFieldFilter) {
      selector.order = [[...req.orderFieldFilter, req.orderFilter]]
    }
    else {
      selector.order = [['updatedAt', req.orderFilter]]
    }

    selector.where = { [Op.and]: [selector.where, req.filterQuery] };

    ProjectProfilesModel.findAndCountAll(selector).
      then(profiles => res.send(successBody({ totalCount: profiles.count, profiles: profiles.rows }))).
      catch(next);
  });


const setProjectProfileMiddleware = (req, res, next) => {

  ProjectProfilesModel.findOne({
    where: {
      id: req.params.profileId
    }
  }).
    then(profile => {
      if (!profile) {
        throw new NotFoundError('profile not found');
      }
      req.profile = profile;
      next();
    }).
    catch(next);
};

profileResourceRouter.get('/:profileId',
  setMiddleware,
  setProjectProfileMiddleware,
  checkRole('project-profile:read'),

  (req, res, next) => {
    res.send(successBody({ profile: req.profile }))
  });

profileResourceRouter.put('/:profileId',
  setMiddleware,
  setProjectProfileMiddleware,
  validate({ body: UpdateProfileSchema }),
  checkRole('project-profile:edit'),
  (req, res, next) => {
    const { title, min_rate, max_rate, status, description } = req.body;
    const updates = {};
    if (title) {
      updates.title = title;
    }
    if (min_rate) {
      updates.min_rate = min_rate;
    }
    if (max_rate) {
      updates.max_rate = max_rate;
    }
    if (status) {
      updates.status = status;
    }
    if (description) {
      updates.description = description;
    }
 
    ProjectProfilesModel.findOne({
      //limit: 1,
      where: {
        project_id:req.profile.project_id,
        //[Op.ne]:req.profile.project_id,
        //[Op.ne]:project_id:req.profile.project_id,
        id:{[Op.ne]:req.profile.id},
        category_id:req.profile.category_id,
        title:title
        //your where conditions, or without them if you need ANY entry
      }
    }).then(function(entries){
    
      if(entries == undefined || entries == null || Object.keys(entries).length <= 0){ 
        req.profile.update(updates).
          then(() => res.send(successBody({ message: 'Project profile updated successfully' }))).
          catch(next);
      } else {
        res.send(successBody({ message: 'title already exist', profile: {} }));
      }
    });
  });

profileResourceRouter.delete('/:profileId',
  setMiddleware,
  setProjectProfileMiddleware,
  checkRole('project-profile:delete'),
  (req, res, next) => {
    return sequelize.transaction(t => {
      return req.profile.destroyObject(t);
    }).
      then(() => res.send(successBody({ message: "Profile has been deleted" }))).
      catch(next);
  });
